export const defaultVoiceSettings = {
  ttsModel: "chatterbox",
  audioPromptPath: "",
  deliveryProfile: "suspense",
  intensity: 0.55,
  stability: 0.65,
  pacing: 0.5,
  variation: 0.5,
  exaggeration: 0.55,
  cfgWeight: 0.35,
  temperature: 0.75,
  seed: "",
};

function optionalNumber(value, fallback, min, max) {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function semanticVoiceMapping({ deliveryProfile, intensity, stability, pacing, variation }) {
  const profile = String(deliveryProfile || "suspense");
  const PROFILE_BASE = {
    controlled: { exaggeration: 0.42, cfgWeight: 0.55, temperature: 0.58 },
    dramatic: { exaggeration: 0.74, cfgWeight: 0.34, temperature: 0.88 },
  };
  const base = PROFILE_BASE[profile] ?? { exaggeration: 0.55, cfgWeight: 0.42, temperature: 0.72 };
  const intensityDelta = (intensity - 0.5) * 0.8;
  const stabilityDelta = (stability - 0.5) * 0.6;
  const pacingDelta = (0.5 - pacing) * 0.25;
  const variationDelta = (variation - 0.5) * 0.9;
  return {
    exaggeration: Number(clamp(base.exaggeration + intensityDelta, 0, 1.5).toFixed(2)),
    cfgWeight: Number(clamp(base.cfgWeight + stabilityDelta, 0, 1.5).toFixed(2)),
    temperature: Number(clamp(base.temperature + variationDelta + pacingDelta, 0, 2).toFixed(2)),
  };
}

export function normalizeVoiceSettings(input = {}) {
  const deliveryProfile =
    String(input.deliveryProfile || defaultVoiceSettings.deliveryProfile).trim() ||
    defaultVoiceSettings.deliveryProfile;
  const intensity = optionalNumber(input.intensity, defaultVoiceSettings.intensity, 0, 1);
  const stability = optionalNumber(input.stability, defaultVoiceSettings.stability, 0, 1);
  const pacing = optionalNumber(input.pacing, defaultVoiceSettings.pacing, 0, 1);
  const variation = optionalNumber(input.variation, defaultVoiceSettings.variation, 0, 1);
  const mapped = semanticVoiceMapping({ deliveryProfile, intensity, stability, pacing, variation });
  return {
    ttsModel:
      String(input.ttsModel || defaultVoiceSettings.ttsModel).trim() ||
      defaultVoiceSettings.ttsModel,
    audioPromptPath: String(input.audioPromptPath || "").trim(),
    deliveryProfile,
    intensity,
    stability,
    pacing,
    variation,
    exaggeration: optionalNumber(input.exaggeration, mapped.exaggeration, 0, 1.5),
    cfgWeight: optionalNumber(input.cfgWeight, mapped.cfgWeight, 0, 1.5),
    temperature: optionalNumber(input.temperature, mapped.temperature, 0, 2),
    seed:
      input.seed === "" || input.seed === null || input.seed === undefined
        ? ""
        : String(Math.trunc(Number(input.seed) || 0)),
  };
}

export function voiceSettingsEnv(settings) {
  const normalized = normalizeVoiceSettings(settings);
  const env = {
    CHATTERBOX_TTS_MODEL: normalized.ttsModel,
    CHATTERBOX_EXAGGERATION: String(normalized.exaggeration),
    CHATTERBOX_CFG_WEIGHT: String(normalized.cfgWeight),
    CHATTERBOX_TEMPERATURE: String(normalized.temperature),
  };
  if (normalized.audioPromptPath) env.CHATTERBOX_AUDIO_PROMPT_PATH = normalized.audioPromptPath;
  if (normalized.seed) env.CHATTERBOX_SEED = normalized.seed;
  return env;
}
