import assert from "node:assert/strict";
import { test } from "node:test";
import {
  motionIntensityForBeat,
  normalizeDraftVisualFraming,
  normalizeDraftVisualReferences,
  normalizeReferenceIds,
  normalizeReferencePriority,
} from "../lib/draft/visual-normalization.mjs";

test("normalizeReferencePriority accepts valid values and falls back", () => {
  assert.equal(normalizeReferencePriority("high"), "high");
  assert.equal(normalizeReferencePriority("invalid"), "medium");
  assert.equal(normalizeReferencePriority("invalid", "low"), "low");
});

test("normalizeReferenceIds deduplicates, trims and caps ids", () => {
  const ids = normalizeReferenceIds([" a ", "a", "", null, "b", "c", "d", "e", "f", "g", "h", "i"]);
  assert.deepEqual(ids, ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("normalizeDraftVisualFraming applies conservative fallback defaults", () => {
  const conservative = normalizeDraftVisualFraming({}, true);
  assert.deepEqual(conservative, {
    scaleMode: "contain_blur",
    subjectPosition: "center",
    cropRisk: "high",
    motionStrength: "subtle",
  });
});

test("normalizeDraftVisualReferences uses shared normalization", () => {
  const refs = normalizeDraftVisualReferences({
    referenceIds: [" x ", "x", "y"],
    referencePriority: "high",
  });
  assert.deepEqual(refs, { referenceIds: ["x", "y"], referencePriority: "high" });
});

test("motionIntensityForBeat respects risk caps and bounds", () => {
  assert.equal(motionIntensityForBeat("strong", "high"), 0.1);
  assert.equal(motionIntensityForBeat("subtle", "low"), 0.06);
  assert.equal(motionIntensityForBeat("unknown", "unknown"), 0.12);
});
