import { describe, expect, it } from "vitest";
import { applyVoiceSettingsPreset, voiceSettingsPresetOptions } from "../voice-settings-presets";
import { defaultVoiceSettings } from "../../../../voice-settings.mjs";

describe("voice settings presets", () => {
  it("includes a campfire sage preset for fantasy narration", () => {
    expect(voiceSettingsPresetOptions.map((preset) => preset.label)).toContain("Campfire Sage");
  });

  it("applies campfire sage delivery values and clears the voice reference", () => {
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
      audioPromptPath: "",
      deliveryProfile: "suspense",
      intensity: 0.62,
      stability: 0.75,
      pacing: 0.4,
      variation: 0.45,
      exaggeration: 0.68,
      cfgWeight: 0.35,
      temperature: 0.7,
    });
  });
});
