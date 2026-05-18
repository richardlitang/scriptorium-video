import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatterboxTTSProvider } from "../dist/tts/chatterbox-tts-provider.js";

test("Chatterbox TTS reports an actionable setup error when the server is unreachable", async () => {
  const originalUrl = process.env.CHATTERBOX_TTS_URL;
  process.env.CHATTERBOX_TTS_URL = "http://127.0.0.1:9/v1/audio/speech";

  try {
    await assert.rejects(
      () =>
        new ChatterboxTTSProvider().synthesize({
          text: "hello",
          voiceId: "clone",
          outputPath: "/tmp/lvstudio-unreachable-chatterbox.wav",
          format: "wav",
          options: {}
        }),
      (error) => {
        assert.match(error.message, /Chatterbox TTS server is unreachable/);
        assert.match(error.message, /scripts\/chatterbox_tts_server\.py/);
        assert.doesNotMatch(error.message, /fetch failed/);
        return true;
      }
    );
  } finally {
    if (originalUrl === undefined) delete process.env.CHATTERBOX_TTS_URL;
    else process.env.CHATTERBOX_TTS_URL = originalUrl;
  }
});
