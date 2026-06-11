import {
  narrationBatchLabel,
  narrationBeatProgressLabel,
  narrationBeatRunLabel,
  ttsArgsForBeat,
} from "./draft-audio-labels.mjs";
import { preflightDraftTtsProviders } from "../tts/tts-preflight.mjs";
import { ttsProviderForBeat } from "../tts/tts-draft-planning.mjs";

type DraftBeat = Record<string, unknown> & {
  id: string;
  order: number;
  narration: string;
  narrationLanguage?: string;
  voiceDirection?: Record<string, unknown> & {
    language?: string;
    narrationLanguage?: string;
  };
};

type DraftSection = {
  id: string;
  title?: string;
  beats?: DraftBeat[];
};

type DraftPlan = {
  providers: {
    tts: string;
    transcription?: string;
  };
  sections?: DraftSection[];
};

type DraftJob = {
  id: string;
  completed: number;
  phase?: string;
  currentSectionId?: string;
  currentSectionTitle?: string;
  currentBeatId?: string;
  currentBeatIndex?: number;
  currentBeatTotal?: number;
};

type RetriedStep = (
  projectId: string,
  job: DraftJob,
  label: string,
  operation: () => Promise<{ stdout?: string }>,
  options?: { countCompletion?: boolean },
) => Promise<unknown>;

type DraftAudioRunnerDeps = {
  readVoiceSettings: () => Promise<Record<string, unknown>>;
  appendRunTrace: (
    projectId: string,
    jobId: string,
    event: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  summarizeVoiceSettingsForTrace: (settings: Record<string, unknown>) => Record<string, unknown>;
  ensureChatterboxReady: (reason: string) => Promise<Record<string, unknown>>;
  readMmsHealth: () => Promise<Record<string, unknown>>;
  getOpenAiApiKey: () => Promise<string | undefined>;
  writeDraftJobState: (
    projectId: string,
    job: DraftJob,
    patch?: Record<string, unknown>,
  ) => Promise<void>;
  runRetriedDraftStep: RetriedStep;
  runLvstudioForDraft: (job: DraftJob, args: string[]) => Promise<{ stdout?: string }>;
  readProjectTraceSnapshot: (projectId: string) => Promise<Record<string, unknown>>;
};

function countWords(value: string): number {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function createDraftAudioRunner({
  readVoiceSettings,
  appendRunTrace,
  summarizeVoiceSettingsForTrace,
  ensureChatterboxReady,
  readMmsHealth,
  getOpenAiApiKey,
  writeDraftJobState,
  runRetriedDraftStep,
  runLvstudioForDraft,
  readProjectTraceSnapshot,
}: DraftAudioRunnerDeps) {
  return async function generateDraftAudioBySection(
    projectId: string,
    job: DraftJob,
    plan: DraftPlan,
    transcriptionProvider: string,
  ): Promise<void> {
    const sections = plan.sections ?? [];
    const beatRefs = sections.flatMap((section) =>
      [...(section.beats ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((beat) => ({
          section,
          beat,
          provider: ttsProviderForBeat(plan.providers.tts, beat),
        })),
    );
    const totalBeats = beatRefs.length;
    let beatCursor = 0;
    const voiceSettings = await readVoiceSettings();
    await appendRunTrace(projectId, job.id, "audio.start", {
      transcriptionProvider,
      voiceSettings: summarizeVoiceSettingsForTrace(voiceSettings),
      totalBeats,
    }).catch(() => {});
    const ttsPreflight = await preflightDraftTtsProviders(plan, {
      ensureChatterboxReady,
      readMmsHealth,
      getOpenAiApiKey,
    });
    await appendRunTrace(projectId, job.id, "audio.tts_preflight.complete", {
      providers: ttsPreflight,
    }).catch(() => {});

    const uniqueProviders = [...new Set(beatRefs.map((ref) => String(ref.provider || "")))].filter(
      Boolean,
    );
    if (beatRefs.length > 0 && uniqueProviders.length === 1) {
      const provider = uniqueProviders[0];
      await appendRunTrace(projectId, job.id, "audio.batch.start", {
        provider,
        beatCount: beatRefs.length,
        beats: beatRefs.map((ref) => ({
          beatId: ref.beat.id,
          sectionId: ref.section.id,
          narrationWords: countWords(ref.beat.narration),
        })),
      }).catch(() => {});
      for (const { section, beat } of beatRefs) {
        beatCursor += 1;
        await appendRunTrace(projectId, job.id, "audio.beat.start", {
          beatId: beat.id,
          sectionId: section.id,
          sectionTitle: section.title,
          provider,
          narrationLanguage:
            beat.voiceDirection?.language ||
            beat.voiceDirection?.narrationLanguage ||
            beat.narrationLanguage,
          narrationChars: String(beat.narration || "").length,
          narrationWords: countWords(beat.narration),
          voiceSettings: summarizeVoiceSettingsForTrace(voiceSettings),
        }).catch(() => {});
        await writeDraftJobState(projectId, job, {
          phase: "audio",
          label: narrationBatchLabel(beatRefs.length, provider),
          currentSectionId: section.id,
          currentSectionTitle: section.title,
          currentBeatId: beat.id,
          currentBeatIndex: beatCursor,
          currentBeatTotal: totalBeats,
        });
        await runRetriedDraftStep(
          projectId,
          job,
          narrationBeatRunLabel(section, beat, provider),
          () => runLvstudioForDraft(job, ttsArgsForBeat(projectId, provider, beat.id)),
          { countCompletion: false },
        );
        await appendRunTrace(projectId, job.id, "audio.beat.complete", {
          beatId: beat.id,
          provider,
        }).catch(() => {});
      }
      job.completed += 1;
      await writeDraftJobState(projectId, job);
      await appendRunTrace(projectId, job.id, "audio.batch.complete", {
        provider,
        beatCount: beatRefs.length,
      }).catch(() => {});
    } else {
      for (const { section, beat, provider } of beatRefs) {
        beatCursor += 1;
        await appendRunTrace(projectId, job.id, "audio.beat.start", {
          beatId: beat.id,
          sectionId: section.id,
          sectionTitle: section.title,
          provider,
          narrationLanguage:
            beat.voiceDirection?.language ||
            beat.voiceDirection?.narrationLanguage ||
            beat.narrationLanguage,
          narrationChars: String(beat.narration || "").length,
          narrationWords: countWords(beat.narration),
          voiceSettings: summarizeVoiceSettingsForTrace(voiceSettings),
        }).catch(() => {});
        await writeDraftJobState(projectId, job, {
          phase: "audio",
          label: narrationBeatProgressLabel(section, beat),
          currentSectionId: section.id,
          currentSectionTitle: section.title,
          currentBeatId: beat.id,
          currentBeatIndex: beatCursor,
          currentBeatTotal: totalBeats,
        });
        await runRetriedDraftStep(
          projectId,
          job,
          narrationBeatRunLabel(section, beat, provider),
          () => runLvstudioForDraft(job, ttsArgsForBeat(projectId, provider, beat.id)),
        );
        await appendRunTrace(projectId, job.id, "audio.beat.complete", {
          beatId: beat.id,
          provider,
        }).catch(() => {});
      }
    }

    await writeDraftJobState(projectId, job, { phase: "sync" });
    await runRetriedDraftStep(projectId, job, "Sync timeline", () =>
      runLvstudioForDraft(job, ["sync", projectId]),
    );
    await appendRunTrace(
      projectId,
      job.id,
      "audio.sync.complete",
      await readProjectTraceSnapshot(projectId),
    ).catch(() => {});
    await writeDraftJobState(projectId, job, { phase: "transcribe" });
    await runRetriedDraftStep(projectId, job, "Transcribe narration", () =>
      runLvstudioForDraft(job, ["transcribe", projectId, "--provider", transcriptionProvider]),
    );
    await appendRunTrace(projectId, job.id, "transcription.complete", {
      transcriptionProvider,
    }).catch(() => {});
    await writeDraftJobState(projectId, job, { phase: "captions" });
    await runRetriedDraftStep(projectId, job, "Generate captions", () =>
      runLvstudioForDraft(job, ["captions", projectId]),
    );
    await appendRunTrace(
      projectId,
      job.id,
      "captions.complete",
      await readProjectTraceSnapshot(projectId),
    ).catch(() => {});
  };
}
