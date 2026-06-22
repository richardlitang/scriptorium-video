import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createStudioRuntimeConfig } from "../lib/runtime/studio-runtime-config.mjs";

test("createStudioRuntimeConfig builds defaults from root directory", () => {
  const config = createStudioRuntimeConfig({ env: {}, rootDir: "/repo" });

  assert.equal(config.port, 4173);
  assert.equal(config.studioTestMode, false);
  assert.equal(config.chatterboxSpeechUrl, "http://127.0.0.1:8000/v1/audio/speech");
  assert.equal(config.chatterboxHealthUrl, "http://127.0.0.1:8000/health");
  assert.equal(config.mmsHealthUrl, "http://127.0.0.1:8001/health");
  assert.deepEqual(config.mmsTtsConfig, {
    speechUrl: "http://127.0.0.1:8001/v1/audio/speech",
    model: "facebook/mms-tts-tgl",
    language: "tgl",
  });
  assert.deepEqual(config.openAiTtsConfig, {
    speechUrl: "https://api.openai.com/v1/audio/speech",
    model: "gpt-4o-mini-tts",
  });
  assert.deepEqual(config.remotionRendererConfig, {
    port: null,
    timeoutInMilliseconds: 120000,
  });
  assert.equal(config.chatterboxStartCommand.script, "/repo/scripts/chatterbox_tts_server.py");
  assert.equal(config.imageConcurrency, 2);
  assert.equal(config.splitPlannerEnabled, true);
  assert.equal(config.splitPlannerMinWords, 2500);
  assert.equal(config.splitPlannerMinUnits, 40);
  assert.deepEqual(config.plannerRequestConfig, {
    model: "gpt-5.4-mini",
    fallbackModels: ["gpt-5-mini", "gpt-4.1-mini"],
    timeoutMs: 300000,
    maxAttempts: 1,
  });
  assert.deepEqual(config.ttsRoutingConfig, {
    enabled: false,
    model: "gpt-4o-mini",
  });
  assert.equal(config.splitPlannerBeatsPerSection, 24);
});

test("createStudioRuntimeConfig parses explicit env values", () => {
  const config = createStudioRuntimeConfig({
    rootDir: "/repo",
    env: {
      PORT: "5000",
      LVSTUDIO_TEST_MODE: "1",
      CHATTERBOX_TTS_URL: "http://localhost:9000/v1/audio/speech?x=1",
      MMS_TTS_URL: "http://localhost:9001/v1/audio/speech",
      MMS_TTS_MODEL: "mms-test",
      MMS_TTS_LANGUAGE: "fil",
      OPENAI_TTS_MODEL: "tts-test",
      LVSTUDIO_REMOTION_PORT: "4567",
      LVSTUDIO_REMOTION_TIMEOUT_MS: "240000",
      OPENAI_IMAGE_MODEL: "image-test",
      LVSTUDIO_IMAGE_CONCURRENCY: "4",
      LVSTUDIO_CHATTERBOX_AUTOSTART: "0",
      LVSTUDIO_CHATTERBOX_START_TIMEOUT_MS: "60000",
      LVSTUDIO_CHATTERBOX_PYTHON: "/venv/bin/python",
      LVSTUDIO_CHATTERBOX_START_SCRIPT: "/custom/server.py",
      CHATTERBOX_MODEL_CACHE: "/cache",
      LVSTUDIO_SPLIT_PLANNER: "0",
      LVSTUDIO_SPLIT_PLANNER_MIN_WORDS: "3000",
      LVSTUDIO_SPLIT_PLANNER_MIN_UNITS: "55",
      OPENAI_PLANNER_MODEL: "gpt-test",
      OPENAI_PLANNER_FALLBACK_MODELS: "gpt-a,gpt-b",
      OPENAI_REQUEST_TIMEOUT_MS: "222000",
      OPENAI_PLANNER_REQUEST_TIMEOUT_MS: "333000",
      OPENAI_PLANNER_REQUEST_MAX_ATTEMPTS: "4",
      LVSTUDIO_OPENAI_TTS_ROUTING: "1",
      OPENAI_TTS_ROUTING_MODEL: "gpt-routing",
      LVSTUDIO_SPLIT_PLANNER_BEATS_PER_SECTION: "12",
      LVSTUDIO_SPLIT_PLANNER_MAX_SECTIONS: "3",
      LVSTUDIO_SPLIT_PLANNER_SECTION_ATTEMPTS: "5",
    },
  });

  assert.equal(config.port, 5000);
  assert.equal(config.studioTestMode, true);
  assert.equal(config.chatterboxHealthUrl, "http://localhost:9000/health");
  assert.equal(config.mmsHealthUrl, "http://localhost:9001/health");
  assert.deepEqual(config.mmsTtsConfig, {
    speechUrl: "http://localhost:9001/v1/audio/speech",
    model: "mms-test",
    language: "fil",
  });
  assert.deepEqual(config.openAiTtsConfig, {
    speechUrl: "https://api.openai.com/v1/audio/speech",
    model: "tts-test",
  });
  assert.deepEqual(config.remotionRendererConfig, {
    port: 4567,
    timeoutInMilliseconds: 240000,
  });
  assert.equal(config.openAiImageModel, "image-test");
  assert.equal(config.imageConcurrency, 4);
  assert.equal(config.chatterboxAutoStartEnabled, false);
  assert.equal(config.chatterboxStartTimeoutMs, 60000);
  assert.equal(config.splitPlannerEnabled, false);
  assert.equal(config.splitPlannerMinWords, 3000);
  assert.equal(config.splitPlannerMinUnits, 55);
  assert.deepEqual(config.plannerRequestConfig, {
    model: "gpt-test",
    fallbackModels: ["gpt-a", "gpt-b"],
    timeoutMs: 333000,
    maxAttempts: 4,
  });
  assert.deepEqual(config.ttsRoutingConfig, {
    enabled: true,
    model: "gpt-routing",
  });
  assert.deepEqual(config.chatterboxStartCommand, {
    python: "/venv/bin/python",
    script: "/custom/server.py",
    modelCache: "/cache",
  });
  assert.equal(config.splitPlannerBeatsPerSection, 12);
  assert.equal(config.splitPlannerMaxSections, 3);
  assert.equal(config.splitPlannerSectionAttempts, 5);
});

test("createStudioRuntimeConfig rejects invalid numeric env values", () => {
  assert.throws(
    () => createStudioRuntimeConfig({ rootDir: "/repo", env: { LVSTUDIO_IMAGE_CONCURRENCY: "0" } }),
    /Invalid LVSTUDIO_IMAGE_CONCURRENCY: 0/,
  );
  assert.throws(
    () =>
      createStudioRuntimeConfig({
        rootDir: "/repo",
        env: { LVSTUDIO_SPLIT_PLANNER_MIN_WORDS: "0" },
      }),
    /Invalid LVSTUDIO_SPLIT_PLANNER_MIN_WORDS: 0/,
  );
  assert.throws(
    () =>
      createStudioRuntimeConfig({
        rootDir: "/repo",
        env: { OPENAI_PLANNER_REQUEST_MAX_ATTEMPTS: "0" },
      }),
    /Invalid OPENAI_PLANNER_REQUEST_MAX_ATTEMPTS: 0/,
  );
  assert.throws(
    () => createStudioRuntimeConfig({ rootDir: "/repo", env: { LVSTUDIO_REMOTION_PORT: "1023" } }),
    /Invalid LVSTUDIO_REMOTION_PORT: 1023/,
  );
  assert.throws(
    () =>
      createStudioRuntimeConfig({
        rootDir: "/repo",
        env: { LVSTUDIO_REMOTION_TIMEOUT_MS: "6999" },
      }),
    /Invalid LVSTUDIO_REMOTION_TIMEOUT_MS: 6999/,
  );
});

test("createStudioRuntimeConfig rejects invalid TTS URL env values", () => {
  assert.throws(
    () => createStudioRuntimeConfig({ rootDir: "/repo", env: { CHATTERBOX_TTS_URL: "not-a-url" } }),
    /Invalid CHATTERBOX_TTS_URL/,
  );
  assert.throws(
    () =>
      createStudioRuntimeConfig({
        rootDir: "/repo",
        env: { MMS_TTS_URL: "ftp:\/\/example.com\/tts" },
      }),
    /Invalid MMS_TTS_URL/,
  );
});

test("createStudioRuntimeConfig treats blank model env overrides as defaults", () => {
  const config = createStudioRuntimeConfig({
    rootDir: "/repo",
    env: {
      OPENAI_PLANNER_MODEL: "   ",
      OPENAI_ORCHESTRATOR_MODEL: "   ",
      OPENAI_TTS_ROUTING_MODEL: "   ",
    },
  });
  assert.equal(config.plannerRequestConfig.model, "gpt-5.4-mini");
  assert.equal(config.ttsRoutingConfig.model, "gpt-4o-mini");
});

test(".env.example key defaults stay aligned with studio runtime defaults", async () => {
  const rootDir = path.resolve(import.meta.dirname, "../../..");
  const envExample = await readFile(path.join(rootDir, ".env.example"), "utf8");
  const config = createStudioRuntimeConfig({ env: {}, rootDir: "/repo" });
  const kv = new Map();
  for (const line of envExample.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    kv.set(match[1], match[2]);
  }

  assert.equal(kv.get("PORT"), String(config.port));
  assert.equal(kv.get("LVSTUDIO_IMAGE_CONCURRENCY"), String(config.imageConcurrency));
  assert.equal(kv.get("CHATTERBOX_TTS_URL"), config.chatterboxSpeechUrl);
  assert.equal(kv.get("MMS_TTS_URL"), config.mmsSpeechUrl);
  assert.equal(kv.get("MMS_TTS_MODEL"), config.mmsTtsConfig.model);
  assert.equal(kv.get("MMS_TTS_LANGUAGE"), config.mmsTtsConfig.language);
  assert.equal(kv.get("OPENAI_TTS_MODEL"), config.openAiTtsConfig.model);
  assert.equal(
    kv.get("LVSTUDIO_REMOTION_PORT"),
    config.remotionRendererConfig.port === null ? "" : String(config.remotionRendererConfig.port),
  );
  assert.equal(
    kv.get("LVSTUDIO_REMOTION_TIMEOUT_MS"),
    String(config.remotionRendererConfig.timeoutInMilliseconds),
  );
  assert.equal(
    kv.get("LVSTUDIO_CHATTERBOX_START_TIMEOUT_MS"),
    String(config.chatterboxStartTimeoutMs),
  );
  assert.equal(
    kv.get("LVSTUDIO_SPLIT_PLANNER_BEATS_PER_SECTION"),
    String(config.splitPlannerBeatsPerSection),
  );
  assert.equal(
    kv.get("LVSTUDIO_SPLIT_PLANNER_MAX_SECTIONS"),
    String(config.splitPlannerMaxSections),
  );
  assert.equal(
    kv.get("LVSTUDIO_SPLIT_PLANNER_SECTION_ATTEMPTS"),
    String(config.splitPlannerSectionAttempts),
  );
  assert.equal(kv.get("LVSTUDIO_SPLIT_PLANNER_MIN_WORDS"), String(config.splitPlannerMinWords));
  assert.equal(kv.get("LVSTUDIO_SPLIT_PLANNER_MIN_UNITS"), String(config.splitPlannerMinUnits));
  assert.equal(kv.get("OPENAI_PLANNER_MODEL"), config.plannerRequestConfig.model);
  assert.equal(kv.get("OPENAI_TTS_ROUTING_MODEL"), config.ttsRoutingConfig.model);
});
