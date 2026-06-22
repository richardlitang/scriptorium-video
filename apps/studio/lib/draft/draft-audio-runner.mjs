import {
  narrationBatchLabel,
  narrationBeatProgressLabel,
  narrationBeatRunLabel,
} from "./draft-audio-labels.mjs";
import { preflightDraftTtsProviders } from "../tts/tts-preflight.mjs";
import { ttsProviderForBeat } from "../tts/tts-draft-planning.mjs";

function countWords(value) {
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
  domainOps,
  readProjectTraceSnapshot,
}) {
  return async function generateDraftAudioBySection(projectId, job, plan, transcriptionProvider) {
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

    const uniqueProviders = [...new Set(beatRefs.map((ref) => ref.provider))];
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
          () =>
            domainOps.generateTts({
              projectId,
              providerId: provider,
              onlyBeat: beat.id,
              force: true,
            }),
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
          () =>
            domainOps.generateTts({
              projectId,
              providerId: provider,
              onlyBeat: beat.id,
              force: true,
            }),
        );
        await appendRunTrace(projectId, job.id, "audio.beat.complete", {
          beatId: beat.id,
          provider,
        }).catch(() => {});
      }
    }

    await writeDraftJobState(projectId, job, { phase: "sync" });
    await runRetriedDraftStep(projectId, job, "Sync timeline", () => domainOps.sync(projectId));
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
      domainOps.captions(projectId),
    );
    await appendRunTrace(
      projectId,
      job.id,
      "captions.complete",
      await readProjectTraceSnapshot(projectId),
    ).catch(() => {});
  };
}
