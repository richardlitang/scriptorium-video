export const defaultVoiceSettings = {
  ttsModel: "chatterbox",
  audioPromptPath: "",
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
  return {
    ttsModel: String(input.ttsModel || defaultVoiceSettings.ttsModel).trim() || defaultVoiceSettings.ttsModel,
    audioPromptPath: String(input.audioPromptPath || "").trim(),
    exaggeration: optionalNumber(input.exaggeration, defaultVoiceSettings.exaggeration, 0, 1.5),
    cfgWeight: optionalNumber(input.cfgWeight, defaultVoiceSettings.cfgWeight, 0, 1.5),
    temperature: optionalNumber(input.temperature, defaultVoiceSettings.temperature, 0, 2),
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
