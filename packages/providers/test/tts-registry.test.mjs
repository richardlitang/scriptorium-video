import assert from "node:assert/strict";
import { test } from "node:test";
import { createTTSProviderRegistry, ttsProviders } from "../dist/tts/registry.js";

test("configured TTS registries are fresh and retain all built-in providers", () => {
  const configured = createTTSProviderRegistry({
    mms: { speechUrl: "http://mms.test/v1/audio/speech" },
    openai: { model: "configured-model", getApiKey: async () => "test-key" },
  });

  assert.notEqual(configured, ttsProviders);
  assert.deepEqual(Object.keys(configured).sort(), [
    "chatterbox",
    "manual",
    "mms",
    "mock",
    "openai",
  ]);
});
