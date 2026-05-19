import assert from "node:assert/strict";
import { test } from "node:test";
import { MMSTTSProvider } from "../dist/tts/mms-tts-provider.js";

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
          options: { language: "fil" }
        }),
      (error) => {
        assert.match(error.message, /MMS TTS server is unreachable/);
        assert.match(error.message, /scripts\/mms_tts_server\.py/);
        return true;
      }
    );
  } finally {
    if (originalUrl === undefined) delete process.env.MMS_TTS_URL;
    else process.env.MMS_TTS_URL = originalUrl;
  }
});
