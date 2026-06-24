import type { defaultVoiceSettings } from "../../../voice-settings.mjs";

export type VoiceSettings = typeof defaultVoiceSettings;

type VoiceSettingsPreset = {
  id: string;
  label: string;
  values: Partial<VoiceSettings>;
  clearsAudioPrompt?: boolean;
};

export const voiceSettingsPresetOptions: readonly VoiceSettingsPreset[] = [
  {
    id: "controlled",
    label: "Controlled",
    values: { exaggeration: 0.45, cfgWeight: 0.45, temperature: 0.6 },
  },
  {
    id: "suspense",
    label: "Suspense",
    values: { exaggeration: 0.55, cfgWeight: 0.35, temperature: 0.75 },
  },
  {
    id: "dramatic",
    label: "Dramatic",
    values: { exaggeration: 0.7, cfgWeight: 0.3, temperature: 0.85 },
  },
  {
    id: "campfire-sage",
    label: "Campfire Sage",
    values: {
      audioPromptPath: "",
      deliveryProfile: "controlled",
      intensity: 0.48,
      stability: 0.92,
      pacing: 0.35,
      variation: 0.2,
      exaggeration: 0.42,
      cfgWeight: 0.7,
      temperature: 0.45,
    },
    clearsAudioPrompt: true,
  },
];

export function applyVoiceSettingsPreset(settings: VoiceSettings, presetId: string): VoiceSettings {
  const preset = voiceSettingsPresetOptions.find((option) => option.id === presetId);
  if (!preset) return settings;
  return { ...settings, ...preset.values };
}
