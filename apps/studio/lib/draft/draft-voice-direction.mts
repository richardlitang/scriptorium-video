const ALLOWED_VOICE_PROFILES = new Set([
  "neutral",
  "warm_open",
  "clear_explainer",
  "authoritative",
  "energetic",
  "key_point",
  "reflective",
  "tense",
  "reveal",
  "urgent",
  "soft_close",
]);

type DraftVoiceDirectionInput = {
  voiceConfidence?: unknown;
  voiceProfile?: unknown;
  narrationLanguage?: unknown;
  ttsProvider?: unknown;
  pauseBeforeMs?: unknown;
  pauseAfterMs?: unknown;
  deliveryNote?: unknown;
  emphasis?: unknown[];
  intensity?: unknown;
  speedMultiplier?: unknown;
  pitchOffset?: unknown;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

export function normalizeDraftVoiceDirection(beatDraft: DraftVoiceDirectionInput = {}) {
  const confidence = clampNumber(beatDraft.voiceConfidence, 0.7, 0, 1);
  const conservative = confidence < 0.45;
  const voiceProfile = String(beatDraft.voiceProfile);
  const profile = ALLOWED_VOICE_PROFILES.has(voiceProfile) ? voiceProfile : "neutral";
  const language =
    String(beatDraft.narrationLanguage || "")
      .trim()
      .toLowerCase() || undefined;
  const provider = String(beatDraft.ttsProvider);
  const ttsProvider = ["chatterbox", "mms", "openai"].includes(provider) ? provider : undefined;
  const pauseBeforeMs = conservative ? 0 : clampInteger(beatDraft.pauseBeforeMs, 0, 0, 1200);
  const pauseAfterMs = conservative ? 80 : clampInteger(beatDraft.pauseAfterMs, 0, 0, 1200);

  return {
    profile: conservative ? "neutral" : profile,
    deliveryNote: String(beatDraft.deliveryNote || "").trim() || undefined,
    emphasis: Array.isArray(beatDraft.emphasis)
      ? beatDraft.emphasis
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : [],
    pauseBeforeMs,
    pauseAfterMs,
    intensity: conservative ? 0.45 : clampNumber(beatDraft.intensity, 0.5, 0, 1),
    speedMultiplier: clampNumber(beatDraft.speedMultiplier, 1, 0.6, 1.5),
    pitchOffset: clampNumber(beatDraft.pitchOffset, 0, -6, 6),
    language,
    ttsProvider,
    source: "llm",
  };
}
