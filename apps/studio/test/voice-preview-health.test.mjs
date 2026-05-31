import assert from "node:assert/strict";
import { test } from "node:test";
import { createVoicePreviewAndHealth } from "../lib/tts/voice-preview-health.mjs";

test("previewVoice caches identical requests", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(Uint8Array.from([1, 2, 3]), { status: 200 });
  };

  const { previewVoice } = createVoicePreviewAndHealth({
    fetchImpl,
    chatterboxSpeechUrl: "http://127.0.0.1:8000/v1/audio/speech",
    chatterboxHealthUrl: "http://127.0.0.1:8000/health",
  });

  const first = await previewVoice({}, "Hello world");
  const second = await previewVoice({}, "Hello world");

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});

test("previewVoice evicts oldest cache entries when cap is reached", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(Uint8Array.from([9]), { status: 200 });
  };

  const { previewVoice } = createVoicePreviewAndHealth({
    fetchImpl,
    chatterboxSpeechUrl: "http://127.0.0.1:8000/v1/audio/speech",
    chatterboxHealthUrl: "http://127.0.0.1:8000/health",
    previewCacheMaxEntries: 1,
  });

  await previewVoice({}, "a");
  await previewVoice({}, "b");
  await previewVoice({}, "a");

  assert.equal(calls, 3);
});

test("voice preview cache can be cleared explicitly", async () => {
  const fetchImpl = async () => new Response(Uint8Array.from([7]), { status: 200 });
  const { previewVoice, previewCacheSize, clearPreviewCache } = createVoicePreviewAndHealth({
    fetchImpl,
    chatterboxSpeechUrl: "http://127.0.0.1:8000/v1/audio/speech",
    chatterboxHealthUrl: "http://127.0.0.1:8000/health",
  });

  await previewVoice({}, "cache me");
  assert.equal(previewCacheSize(), 1);
  clearPreviewCache();
  assert.equal(previewCacheSize(), 0);
});

test("readTtsHealth returns ready status in studio test mode", async () => {
  const { readTtsHealth } = createVoicePreviewAndHealth({
    chatterboxSpeechUrl: "http://127.0.0.1:8000/v1/audio/speech",
    chatterboxHealthUrl: "http://127.0.0.1:8000/health",
    studioTestMode: true,
  });

  assert.deepEqual(await readTtsHealth(), {
    provider: "chatterbox",
    ok: true,
    status: "ready",
    sampleRate: 24000,
    error: null,
  });
});

test("readTtsHealth maps 404 health endpoint to no_health_endpoint", async () => {
  const { readTtsHealth } = createVoicePreviewAndHealth({
    fetchImpl: async () => new Response("{}", { status: 404 }),
    chatterboxSpeechUrl: "http://127.0.0.1:8000/v1/audio/speech",
    chatterboxHealthUrl: "http://127.0.0.1:8000/health",
  });

  const health = await readTtsHealth();
  assert.equal(health.ok, true);
  assert.equal(health.status, "no_health_endpoint");
});
