import assert from "node:assert/strict";
import { test } from "node:test";
import { createMMSTTSProvider, MMSTTSProvider } from "../dist/tts/mms-tts-provider.js";

test("explicit MMS config overrides ambient endpoint and payload defaults", async () => {
  const original = {
    url: process.env.MMS_TTS_URL,
    model: process.env.MMS_TTS_MODEL,
    language: process.env.MMS_TTS_LANGUAGE,
  };
  process.env.MMS_TTS_URL = "http://ambient.test/v1/audio/speech";
  process.env.MMS_TTS_MODEL = "ambient-model";
  process.env.MMS_TTS_LANGUAGE = "ambient-language";
  const calls = [];
  try {
    const provider = createMMSTTSProvider(
      {
        speechUrl: "http://configured.test/v1/audio/speech",
        model: "configured-model",
        language: "configured-language",
      },
      {
        fetchImpl: async (url, options) => {
          calls.push([String(url), options]);
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        },
        probeMediaImpl: async () => ({ durationSeconds: 1.25 }),
      },
    );

    await provider.synthesize({
      text: "Kumusta",
      voiceId: "default",
      outputPath: "/tmp/lvstudio-configured-mms.wav",
      format: "wav",
      options: {},
    });

    const [url, options] = calls[0];
    assert.equal(url, "http://configured.test/v1/audio/speech");
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, "configured-model");
    assert.equal(payload.language, "configured-language");
  } finally {
    for (const [name, value] of Object.entries({
      MMS_TTS_URL: original.url,
      MMS_TTS_MODEL: original.model,
      MMS_TTS_LANGUAGE: original.language,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("MMS request language overrides configured language", async () => {
  let payload;
  const provider = createMMSTTSProvider(
    { language: "configured-language" },
    {
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body);
        return new Response(new Uint8Array([1]), { status: 200 });
      },
      probeMediaImpl: async () => ({ durationSeconds: 1 }),
    },
  );

  await provider.synthesize({
    text: "Kumusta",
    voiceId: "default",
    outputPath: "/tmp/lvstudio-request-language-mms.wav",
    format: "wav",
    options: { language: "fil" },
  });

  assert.equal(payload.language, "fil");
});

test("MMS TTS reports actionable setup errors when server is unreachable", async () => {
  const originalUrl = process.env.MMS_TTS_URL;
  process.env.MMS_TTS_URL = "http://127.0.0.1:9/v1/audio/speech";
  try {
    await assert.rejects(
      () =>
        new MMSTTSProvider().synthesize({
          text: "Kumusta",
          voiceId: "default",
          outputPath: "/tmp/lvstudio-unreachable-mms.wav",
          format: "wav",
          options: { language: "fil" },
        }),
      (error) => {
        assert.match(error.message, /MMS TTS server is unreachable/);
        assert.match(error.message, /scripts\/mms_tts_server\.py/);
        return true;
      },
    );
  } finally {
    if (originalUrl === undefined) delete process.env.MMS_TTS_URL;
    else process.env.MMS_TTS_URL = originalUrl;
  }
});
