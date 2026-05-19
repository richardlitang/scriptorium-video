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
  seed: ""
};

function optionalNumber(value, fallback, min, max) {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeVoiceSettings(input = {}) {
  const deliveryProfile = String(input.deliveryProfile || defaultVoiceSettings.deliveryProfile).trim() || defaultVoiceSettings.deliveryProfile;
  const intensity = optionalNumber(input.intensity, defaultVoiceSettings.intensity, 0, 1);
  const stability = optionalNumber(input.stability, defaultVoiceSettings.stability, 0, 1);
  const pacing = optionalNumber(input.pacing, defaultVoiceSettings.pacing, 0, 1);
  const variation = optionalNumber(input.variation, defaultVoiceSettings.variation, 0, 1);
  const mappedExaggeration = Number((0.35 + intensity * 0.8).toFixed(2));
  const mappedCfgWeight = Number((0.2 + stability * 0.8).toFixed(2));
  const mappedTemperature = Number((0.35 + variation * 1.2).toFixed(2));
  return {
    ttsModel: String(input.ttsModel || defaultVoiceSettings.ttsModel).trim() || defaultVoiceSettings.ttsModel,
    audioPromptPath: String(input.audioPromptPath || "").trim(),
    deliveryProfile,
    intensity,
    stability,
    pacing,
    variation,
    exaggeration: optionalNumber(input.exaggeration, mappedExaggeration, 0, 1.5),
    cfgWeight: optionalNumber(input.cfgWeight, mappedCfgWeight, 0, 1.5),
    temperature: optionalNumber(input.temperature, mappedTemperature, 0, 2),
    seed: input.seed === "" || input.seed === null || input.seed === undefined
      ? ""
      : String(Math.trunc(Number(input.seed) || 0))
  };
}

export function voiceSettingsEnv(settings) {
  const normalized = normalizeVoiceSettings(settings);
  const env = {
    CHATTERBOX_TTS_MODEL: normalized.ttsModel,
    CHATTERBOX_EXAGGERATION: String(normalized.exaggeration),
    CHATTERBOX_CFG_WEIGHT: String(normalized.cfgWeight),
    CHATTERBOX_TEMPERATURE: String(normalized.temperature)
  };
  if (normalized.audioPromptPath) env.CHATTERBOX_AUDIO_PROMPT_PATH = normalized.audioPromptPath;
  if (normalized.seed) env.CHATTERBOX_SEED = normalized.seed;
  return env;
}
