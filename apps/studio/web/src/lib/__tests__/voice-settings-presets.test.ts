import { describe, expect, it } from "vitest";
import { applyVoiceSettingsPreset, voiceSettingsPresetOptions } from "../voice-settings-presets";
import { defaultVoiceSettings } from "../../../../voice-settings.mjs";

describe("voice settings presets", () => {
  it("includes a campfire sage preset for fantasy narration", () => {
    expect(voiceSettingsPresetOptions.map((preset) => preset.label)).toContain("Campfire Sage");
  });

  it("applies grounded campfire sage delivery values and the bundled voice reference", () => {
    const settings = {
      ...defaultVoiceSettings,
      audioPromptPath: "/tmp/current-reference.wav",
      intensity: 0.2,
      stability: 0.2,
      pacing: 0.9,
      variation: 0.9,
      exaggeration: 0.2,
      cfgWeight: 0.9,
      temperature: 0.2,
    };

    expect(applyVoiceSettingsPreset(settings, "campfire-sage")).toMatchObject({
      audioPromptPath: "apps/studio/assets/voices/campfire-sage.wav",
      deliveryProfile: "controlled",
      intensity: 0.48,
      stability: 0.92,
      pacing: 0.35,
      variation: 0.2,
      exaggeration: 0.42,
      cfgWeight: 0.7,
      temperature: 0.45,
    });
  });
});
