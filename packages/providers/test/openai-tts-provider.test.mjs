import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAITTSProvider } from "../dist/tts/openai-tts-provider.js";

test("explicit OpenAI TTS config overrides ambient model and injects credentials", async () => {
  const originalModel = process.env.OPENAI_TTS_MODEL;
  process.env.OPENAI_TTS_MODEL = "ambient-model";
  const calls = [];
  try {
    const provider = createOpenAITTSProvider(
      {
        speechUrl: "http://configured.test/v1/audio/speech",
        model: "configured-model",
        getApiKey: async () => "configured-key",
      },
      {
        fetchImpl: async (url, options) => {
          calls.push([String(url), options]);
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        },
        probeMediaImpl: async () => ({ durationSeconds: 2.5 }),
      },
    );

    const result = await provider.synthesize({
      text: "hello",
      voiceId: "marin",
      outputPath: "/tmp/lvstudio-configured-openai.mp3",
      format: "mp3",
      options: {},
    });

    const [url, options] = calls[0];
    assert.equal(url, "http://configured.test/v1/audio/speech");
    assert.equal(options.headers.authorization, "Bearer configured-key");
    assert.equal(JSON.parse(options.body).model, "configured-model");
    assert.equal(result.durationSeconds, 2.5);
  } finally {
    if (originalModel === undefined) delete process.env.OPENAI_TTS_MODEL;
    else process.env.OPENAI_TTS_MODEL = originalModel;
  }
});
