import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dimensionsFromSize,
  mapWithConcurrency,
  safeVoiceReferenceFileName,
} from "../lib/runtime/studio-runtime-helpers.mjs";

test("safeVoiceReferenceFileName keeps the basename and sanitizes unsafe characters", () => {
  assert.equal(safeVoiceReferenceFileName("../Voice Ref (Draft).wav"), "Voice-Ref--Draft-.wav");
});

test("dimensionsFromSize returns numeric width and height for valid sizes", () => {
  assert.deepEqual(dimensionsFromSize("1280x720"), { width: 1280, height: 720 });
  assert.deepEqual(dimensionsFromSize("bad-size"), {});
});

test("mapWithConcurrency preserves item order while limiting in-flight work", async () => {
  let active = 0;
  let maxActive = 0;

  const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, value === 1 ? 10 : 0));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(results, [2, 4, 6, 8]);
  assert.equal(maxActive, 2);
});
