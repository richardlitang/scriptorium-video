import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPayload, checkChatterboxCapability, ChatterboxTTSProvider } from "../dist/tts/chatterbox-tts-provider.js";

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

test("checkChatterboxCapability reports ready health", async () => {
  const originalUrl = process.env.CHATTERBOX_TTS_URL;
  process.env.CHATTERBOX_TTS_URL = "http://127.0.0.1:8000/v1/audio/speech";

  try {
    const capability = await checkChatterboxCapability(async (url) => {
      assert.equal(String(url), "http://127.0.0.1:8000/health");
      return new Response(JSON.stringify({ ok: true, status: "ready" }), { status: 200 });
    });

    assert.equal(capability.available, true);
    assert.equal(capability.status, "ready");
    assert.equal(capability.healthUrl, "http://127.0.0.1:8000/health");
  } finally {
    if (originalUrl === undefined) delete process.env.CHATTERBOX_TTS_URL;
    else process.env.CHATTERBOX_TTS_URL = originalUrl;
  }
});

test("checkChatterboxCapability reports failed model health", async () => {
  const originalUrl = process.env.CHATTERBOX_TTS_URL;
  process.env.CHATTERBOX_TTS_URL = "http://127.0.0.1:8000/v1/audio/speech";

  try {
    const capability = await checkChatterboxCapability(async () => {
      return new Response(JSON.stringify({ ok: false, status: "failed", error: "model missing" }), { status: 200 });
    });

    assert.equal(capability.available, false);
    assert.equal(capability.status, "failed");
    assert.equal(capability.message, "model missing");
  } finally {
    if (originalUrl === undefined) delete process.env.CHATTERBOX_TTS_URL;
    else process.env.CHATTERBOX_TTS_URL = originalUrl;
  }
});

test("buildPayload prefers providerOptions over environment values", () => {
  const original = {
    exaggeration: process.env.CHATTERBOX_EXAGGERATION,
    cfgWeight: process.env.CHATTERBOX_CFG_WEIGHT,
    temperature: process.env.CHATTERBOX_TEMPERATURE,
    seed: process.env.CHATTERBOX_SEED,
    prompt: process.env.CHATTERBOX_AUDIO_PROMPT_PATH
  };
  try {
    process.env.CHATTERBOX_EXAGGERATION = "0.1";
    process.env.CHATTERBOX_CFG_WEIGHT = "0.2";
    process.env.CHATTERBOX_TEMPERATURE = "0.3";
    process.env.CHATTERBOX_SEED = "5";
    process.env.CHATTERBOX_AUDIO_PROMPT_PATH = "/tmp/env.wav";

    const payload = buildPayload({
      text: "hello",
      voiceId: "clone",
      outputPath: "/tmp/out.wav",
      format: "wav",
      options: {},
      providerOptions: {
        exaggeration: 0.6,
        cfg_weight: 0.4,
        temperature: 0.7,
        seed: 42,
        audio_prompt_path: "/tmp/request.wav"
      }
    });

    assert.equal(payload.exaggeration, 0.6);
    assert.equal(payload.cfg_weight, 0.4);
    assert.equal(payload.temperature, 0.7);
    assert.equal(payload.seed, 42);
    assert.equal(payload.audio_prompt_path, "/tmp/request.wav");
  } finally {
    if (original.exaggeration === undefined) delete process.env.CHATTERBOX_EXAGGERATION;
    else process.env.CHATTERBOX_EXAGGERATION = original.exaggeration;
    if (original.cfgWeight === undefined) delete process.env.CHATTERBOX_CFG_WEIGHT;
    else process.env.CHATTERBOX_CFG_WEIGHT = original.cfgWeight;
    if (original.temperature === undefined) delete process.env.CHATTERBOX_TEMPERATURE;
    else process.env.CHATTERBOX_TEMPERATURE = original.temperature;
    if (original.seed === undefined) delete process.env.CHATTERBOX_SEED;
    else process.env.CHATTERBOX_SEED = original.seed;
    if (original.prompt === undefined) delete process.env.CHATTERBOX_AUDIO_PROMPT_PATH;
    else process.env.CHATTERBOX_AUDIO_PROMPT_PATH = original.prompt;
  }
});

test("buildPayload falls back to environment values when providerOptions are absent", () => {
  const original = {
    exaggeration: process.env.CHATTERBOX_EXAGGERATION,
    cfgWeight: process.env.CHATTERBOX_CFG_WEIGHT,
    temperature: process.env.CHATTERBOX_TEMPERATURE,
    seed: process.env.CHATTERBOX_SEED,
    prompt: process.env.CHATTERBOX_AUDIO_PROMPT_PATH
  };
  try {
    process.env.CHATTERBOX_EXAGGERATION = "0.11";
    process.env.CHATTERBOX_CFG_WEIGHT = "0.22";
    process.env.CHATTERBOX_TEMPERATURE = "0.33";
    process.env.CHATTERBOX_SEED = "7";
    process.env.CHATTERBOX_AUDIO_PROMPT_PATH = "/tmp/env-fallback.wav";

    const payload = buildPayload({
      text: "hello",
      voiceId: "clone",
      outputPath: "/tmp/out.wav",
      format: "wav",
      options: {}
    });

    assert.equal(payload.exaggeration, 0.11);
    assert.equal(payload.cfg_weight, 0.22);
    assert.equal(payload.temperature, 0.33);
    assert.equal(payload.seed, 7);
    assert.equal(payload.audio_prompt_path, "/tmp/env-fallback.wav");
  } finally {
    if (original.exaggeration === undefined) delete process.env.CHATTERBOX_EXAGGERATION;
    else process.env.CHATTERBOX_EXAGGERATION = original.exaggeration;
    if (original.cfgWeight === undefined) delete process.env.CHATTERBOX_CFG_WEIGHT;
    else process.env.CHATTERBOX_CFG_WEIGHT = original.cfgWeight;
    if (original.temperature === undefined) delete process.env.CHATTERBOX_TEMPERATURE;
    else process.env.CHATTERBOX_TEMPERATURE = original.temperature;
    if (original.seed === undefined) delete process.env.CHATTERBOX_SEED;
    else process.env.CHATTERBOX_SEED = original.seed;
    if (original.prompt === undefined) delete process.env.CHATTERBOX_AUDIO_PROMPT_PATH;
    else process.env.CHATTERBOX_AUDIO_PROMPT_PATH = original.prompt;
  }
});
