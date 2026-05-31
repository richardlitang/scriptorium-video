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

function clampNumber(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

export function normalizeDraftVoiceDirection(beatDraft = {}) {
  const confidence = clampNumber(beatDraft.voiceConfidence, 0.7, 0, 1);
  const conservative = confidence < 0.45;
  const profile = ALLOWED_VOICE_PROFILES.has(beatDraft.voiceProfile)
    ? beatDraft.voiceProfile
    : "neutral";
  const language =
    String(beatDraft.narrationLanguage || "")
      .trim()
      .toLowerCase() || undefined;
  const ttsProvider = ["chatterbox", "mms", "openai"].includes(beatDraft.ttsProvider)
    ? beatDraft.ttsProvider
    : undefined;
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
