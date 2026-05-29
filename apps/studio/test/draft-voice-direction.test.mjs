import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDraftVoiceDirection } from "../lib/draft/draft-voice-direction.mjs";

test("normalizeDraftVoiceDirection clamps and normalizes non-conservative draft voice fields", () => {
  const normalized = normalizeDraftVoiceDirection({
    voiceConfidence: 0.9,
    voiceProfile: "urgent",
    deliveryNote: "  keep it tense  ",
    emphasis: ["  first  ", "", "second"],
    pauseBeforeMs: 1300,
    pauseAfterMs: -12,
    pauseBeforeSeconds: 1.8,
    pauseAfterSeconds: -1,
    intensity: 5,
    speedMultiplier: 9,
    pitchOffset: -9,
    narrationLanguage: " EN ",
    ttsProvider: "chatterbox",
  });

  assert.equal(normalized.profile, "urgent");
  assert.equal(normalized.deliveryNote, "keep it tense");
  assert.deepEqual(normalized.emphasis, ["first", "second"]);
  assert.equal(normalized.pauseBeforeMs, 1200);
  assert.equal(normalized.pauseAfterMs, 0);
  assert.equal(normalized.pauseBeforeSeconds, undefined);
  assert.equal(normalized.pauseAfterSeconds, undefined);
  assert.equal(normalized.intensity, 1);
  assert.equal(normalized.speedMultiplier, 1.5);
  assert.equal(normalized.pitchOffset, -6);
  assert.equal(normalized.language, "en");
  assert.equal(normalized.ttsProvider, "chatterbox");
  assert.equal(normalized.source, "llm");
});

test("normalizeDraftVoiceDirection applies conservative fallback when confidence is low", () => {
  const normalized = normalizeDraftVoiceDirection({
    voiceConfidence: 0.2,
    voiceProfile: "urgent",
    pauseBeforeMs: 400,
    pauseAfterMs: 500,
    pauseBeforeSeconds: 0.4,
    pauseAfterSeconds: 0.9,
    intensity: 0.9,
    ttsProvider: "invalid",
  });

  assert.equal(normalized.profile, "neutral");
  assert.equal(normalized.pauseBeforeMs, 0);
  assert.equal(normalized.pauseAfterMs, 80);
  assert.equal(normalized.pauseBeforeSeconds, undefined);
  assert.equal(normalized.pauseAfterSeconds, undefined);
  assert.equal(normalized.intensity, 0.45);
  assert.equal(normalized.ttsProvider, undefined);
});
