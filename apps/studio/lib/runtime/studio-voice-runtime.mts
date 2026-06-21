import type { ChatterboxRuntimeConfig } from "@lvstudio/providers";
import type { normalizeVoiceSettings } from "../../voice-settings.mjs";

type VoiceSettings = ReturnType<typeof normalizeVoiceSettings>;

export function voiceRuntimeForSettings(
  settings: VoiceSettings,
  processEnv: NodeJS.ProcessEnv,
): ChatterboxRuntimeConfig {
  return {
    speechUrl: processEnv.CHATTERBOX_TTS_URL,
    apiKey: processEnv.CHATTERBOX_TTS_API_KEY,
    model: settings.ttsModel,
    audioPromptPath: settings.audioPromptPath || undefined,
    exaggeration: settings.exaggeration,
    cfgWeight: settings.cfgWeight,
    temperature: settings.temperature,
    seed: settings.seed ? Number(settings.seed) : undefined,
  };
}
