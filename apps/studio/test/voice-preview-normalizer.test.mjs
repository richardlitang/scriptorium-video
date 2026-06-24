import assert from "node:assert/strict";
import { test } from "node:test";
import { createVoicePreviewNormalizer } from "../lib/tts/voice-preview-normalizer.mjs";

test("voice preview normalizer writes preview bytes, normalizes the file, returns processed bytes, and cleans up", async () => {
  const calls = [];
  const normalizer = createVoicePreviewNormalizer({
    mkdtempImpl: async (prefix) => {
      calls.push(["mkdtemp", prefix]);
      return "/tmp/lvstudio-voice-preview-test";
    },
    writeFileImpl: async (file, bytes) => {
      calls.push(["writeFile", file, [...bytes]]);
    },
    normalizeVoiceoverImpl: async (file) => {
      calls.push(["normalizeVoiceover", file]);
    },
    readFileImpl: async (file) => {
      calls.push(["readFile", file]);
      return Buffer.from([9, 8, 7]);
    },
    rmImpl: async (dir, options) => {
      calls.push(["rm", dir, options]);
    },
    tmpdirImpl: () => "/tmp",
  });

  const bytes = await normalizer(Buffer.from([1, 2, 3]));

  assert.deepEqual([...bytes], [9, 8, 7]);
  assert.deepEqual(calls, [
    ["mkdtemp", "/tmp/lvstudio-voice-preview-"],
    ["writeFile", "/tmp/lvstudio-voice-preview-test/preview.wav", [1, 2, 3]],
    ["normalizeVoiceover", "/tmp/lvstudio-voice-preview-test/preview.wav"],
    ["readFile", "/tmp/lvstudio-voice-preview-test/preview.wav"],
    ["rm", "/tmp/lvstudio-voice-preview-test", { recursive: true, force: true }],
  ]);
});
