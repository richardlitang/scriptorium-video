import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeVoiceSettings } from "../voice-settings.mjs";
import { voiceRuntimeForSettings } from "../lib/runtime/studio-voice-runtime.mjs";

void test("voice runtime maps normalized Studio settings without changing its environment input", () => {
  const environment = {
    CHATTERBOX_TTS_URL: "http://configured.test/v1/audio/speech",
    CHATTERBOX_TTS_API_KEY: "server-key",
  };
  const settings = normalizeVoiceSettings({
    ttsModel: "studio-model",
    audioPromptPath: "/tmp/voice.wav",
    exaggeration: 0.6,
    cfgWeight: 0.4,
    temperature: 0.8,
    seed: "42",
  });

  assert.deepEqual(voiceRuntimeForSettings(settings, environment), {
    speechUrl: "http://configured.test/v1/audio/speech",
    apiKey: "server-key",
    model: "studio-model",
    audioPromptPath: "/tmp/voice.wav",
    exaggeration: 0.6,
    cfgWeight: 0.4,
    temperature: 0.8,
    seed: 42,
  });
  assert.deepEqual(environment, {
    CHATTERBOX_TTS_URL: "http://configured.test/v1/audio/speech",
    CHATTERBOX_TTS_API_KEY: "server-key",
  });
});
