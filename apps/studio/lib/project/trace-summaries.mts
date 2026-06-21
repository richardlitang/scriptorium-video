import { createHash } from "node:crypto";
import path from "node:path";
import { voiceSettingsEnv } from "../../voice-settings.mjs";

type BeatTrace = {
  id?: string;
  order?: number;
  narration?: string;
  narrationLanguage?: string;
  media?: unknown[];
  visualEditCues?: unknown[];
  silenceWindows?: unknown[];
  voiceDirection?: { ttsProvider?: string; language?: string; narrationLanguage?: string };
  direction?: {
    voice?: { ttsProvider?: string };
    editorial?: { visualEditCues?: unknown[]; silenceWindows?: unknown[] };
  };
};

type SectionTrace = { id?: string; title?: string; beats?: BeatTrace[] };
type PlanTrace = { title?: string; providers?: { tts?: string }; sections?: SectionTrace[] };
type ManifestAsset = {
  id?: string;
  role?: string;
  beatId?: string;
  sectionId?: string;
  status?: string;
  path?: string;
  durationSeconds?: number;
  source?: { kind?: string; provider?: string };
};
type ManifestTrace = { assets?: ManifestAsset[] };
type TimelineSegment = {
  beatId?: string;
  startSeconds?: number;
  endSeconds?: number;
  durationSeconds?: number;
  voiceAssetId?: string;
  mediaAssetIds?: string[];
  visualEditCues?: unknown[];
  silenceWindows?: unknown[];
};
type TimelineTrace = { durationSeconds?: number; segments?: TimelineSegment[] };
type VoiceSettingsTrace = {
  ttsModel?: string;
  deliveryProfile?: string;
  audioPromptPath?: string;
};

function beatTraceSummary(
  beat: BeatTrace,
  section: SectionTrace,
  defaultProvider: string | undefined,
) {
  return {
    sectionId: section.id,
    sectionTitle: section.title,
    beatId: beat.id,
    order: beat.order,
    narrationChars: String(beat.narration || "").length,
    narrationWords: countWords(beat.narration),
    ttsProvider:
      beat.voiceDirection?.ttsProvider || beat.direction?.voice?.ttsProvider || defaultProvider,
    narrationLanguage:
      beat.voiceDirection?.language ||
      beat.voiceDirection?.narrationLanguage ||
      beat.narrationLanguage,
    mediaCount: beat.media?.length ?? 0,
    visualCueCount:
      beat.direction?.editorial?.visualEditCues?.length ?? beat.visualEditCues?.length ?? 0,
    silenceWindowCount:
      beat.direction?.editorial?.silenceWindows?.length ?? beat.silenceWindows?.length ?? 0,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function countWords(value: string | undefined) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

function redactPath(value: string | undefined) {
  if (!value) return "";
  return path.basename(String(value));
}

export function directiveCandidateLines(story: string | undefined) {
  return String(story || "")
    .split(/\r?\n/)
    .map((line, index) => ({ index: index + 1, text: line.trim() }))
    .filter(({ text }) => {
      if (!text) return false;
      const bracketed = /^\[[^\]]+\]$/.test(text);
      const stageCue =
        /\b(CUT|BLACK|FADE|THUD|WHOOSH|SFX|MUSIC|SILENCE|PAUSE|SMASH|DISSOLVE|TITLE CARD|B-ROLL|VISUAL)\b/i.test(
          text,
        );
      return bracketed && stageCue;
    })
    .slice(0, 40);
}

export function summarizeStoryInput(story: string | undefined) {
  const raw = String(story || "");
  return {
    hash: sha256(raw),
    chars: raw.length,
    words: countWords(raw),
    lines: raw ? raw.split(/\r?\n/).length : 0,
    directiveCandidateLines: directiveCandidateLines(raw),
  };
}

export function summarizePlanForTrace(plan: PlanTrace, story = "") {
  const beats = (plan.sections ?? []).flatMap((section) =>
    (section.beats ?? []).map((beat) => beatTraceSummary(beat, section, plan.providers?.tts)),
  );
  const narrationWords = beats.reduce((sum, beat) => sum + beat.narrationWords, 0);
  const storyWords = countWords(story);
  return {
    title: plan.title,
    sectionCount: plan.sections?.length ?? 0,
    beatCount: beats.length,
    narrationWords,
    storyWords,
    narrationToStoryWordRatio:
      storyWords > 0 ? Number((narrationWords / storyWords).toFixed(3)) : null,
    sections: (plan.sections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      beatCount: section.beats?.length ?? 0,
    })),
    beats,
  };
}

export function summarizeManifestForTrace(manifest: ManifestTrace | undefined) {
  const assets = manifest?.assets ?? [];
  return {
    totalAssets: assets.length,
    imageCount: assets.filter((asset) => asset.role === "primary_visual").length,
    voiceCount: assets.filter((asset) => asset.role === "voiceover").length,
    images: assets
      .filter((asset) => asset.role === "primary_visual")
      .map((asset) => ({
        id: asset.id,
        beatId: asset.beatId,
        sectionId: asset.sectionId,
        status: asset.status,
        path: asset.path,
        sourceKind: asset.source?.kind,
        provider: asset.source?.provider,
      })),
    voices: assets
      .filter((asset) => asset.role === "voiceover")
      .map((asset) => ({
        id: asset.id,
        beatId: asset.beatId,
        status: asset.status,
        provider: asset.source?.provider,
        durationSeconds: asset.durationSeconds,
      })),
  };
}

export function summarizeTimelineForTrace(
  timeline: TimelineTrace | undefined,
  manifest: ManifestTrace | undefined,
) {
  const assetsById = new Map((manifest?.assets ?? []).map((asset) => [asset.id, asset]));
  return {
    durationSeconds: timeline?.durationSeconds ?? 0,
    segmentCount: timeline?.segments?.length ?? 0,
    segments: (timeline?.segments ?? []).map((segment) => {
      const visualAsset = assetsById.get(segment.mediaAssetIds?.[0]);
      return {
        beatId: segment.beatId,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        durationSeconds: segment.durationSeconds,
        voiceAssetId: segment.voiceAssetId,
        mediaAssetIds: segment.mediaAssetIds,
        visualSourceBeatId: visualAsset?.beatId,
        visualEditCueCount: segment.visualEditCues?.length ?? 0,
        silenceWindowCount: segment.silenceWindows?.length ?? 0,
      };
    }),
  };
}

export function summarizeVoiceSettingsForTrace(settings: VoiceSettingsTrace) {
  const env = voiceSettingsEnv(settings);
  return {
    ttsModel: settings.ttsModel,
    deliveryProfile: settings.deliveryProfile,
    hasAudioPromptPath: Boolean(settings.audioPromptPath),
    audioPromptFile: redactPath(settings.audioPromptPath),
    envIncludesAudioPrompt: Boolean(
      (env as Record<string, string | undefined>).CHATTERBOX_AUDIO_PROMPT_PATH,
    ),
  };
}
