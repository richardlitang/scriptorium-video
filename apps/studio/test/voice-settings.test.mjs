import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeVoiceSettings, voiceSettingsEnv } from "../voice-settings.mjs";

test("voice settings normalize user input into bounded Chatterbox controls", () => {
  const settings = normalizeVoiceSettings({
    ttsModel: " chatterbox ",
    audioPromptPath: " /tmp/reference.wav ",
    exaggeration: "9",
    cfgWeight: "-1",
    temperature: "0.62",
    seed: "42.9",
  });

  assert.deepEqual(settings, {
    ttsModel: "chatterbox",
    audioPromptPath: "/tmp/reference.wav",
    deliveryProfile: "suspense",
    intensity: 0.55,
    stability: 0.65,
    pacing: 0.5,
    variation: 0.5,
    exaggeration: 1.5,
    cfgWeight: 0,
    temperature: 0.62,
    seed: "42",
  });
});

test("voice settings produce the environment used by CLI TTS jobs", () => {
  assert.deepEqual(
    voiceSettingsEnv({
      ttsModel: "chatterbox",
      audioPromptPath: "/tmp/ref.wav",
      exaggeration: 0.7,
      cfgWeight: 0.3,
      temperature: 0.8,
      seed: "123",
    }),
    {
      CHATTERBOX_TTS_MODEL: "chatterbox",
      CHATTERBOX_EXAGGERATION: "0.7",
      CHATTERBOX_CFG_WEIGHT: "0.3",
      CHATTERBOX_TEMPERATURE: "0.8",
      CHATTERBOX_AUDIO_PROMPT_PATH: "/tmp/ref.wav",
      CHATTERBOX_SEED: "123",
    },
  );
});

test("voice settings derive advanced controls from semantic controls when advanced values are omitted", () => {
  const settings = normalizeVoiceSettings({
    deliveryProfile: "dramatic",
    intensity: 0.9,
    stability: 0.7,
    pacing: 0.2,
    variation: 0.8,
  });

  assert.equal(settings.exaggeration, 1.06);
  assert.equal(settings.cfgWeight, 0.46);
  assert.equal(settings.temperature, 1.23);
});
