import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeVideoPlan } from "../dist/normalize-video-plan.js";

function makePlan(overrides = {}) {
  return {
    schemaVersion: 1,
    title: "Test",
    mode: "short_story",
    targetPlatform: "local_only",
    stylePackId: "default",
    providers: {
      llm: "manual",
      tts: "chatterbox",
      transcription: "mock",
      media: "manual-media",
      renderer: "remotion",
    },
    voice: {
      provider: "chatterbox",
      voiceId: "clone",
      format: "wav",
      options: {},
    },
    sections: [
      {
        id: "sec-1",
        title: "Section",
        summary: "Summary",
        purpose: "purpose",
        beats: [
          {
            id: "beat-1",
            order: 1,
            narration: "Hello world",
            timing: { locked: false, mediaPolicy: "loop_or_freeze" },
            media: [],
            motion: { type: "slow_zoom_in", intensity: 0.1 },
            caption: { emphasis: [], style: "default" },
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("normalizeVideoPlan migrates legacy beat voiceDirection/sfx/editorial into direction", () => {
  const plan = makePlan();
  const beat = plan.sections[0].beats[0];
  beat.voiceDirection = { profile: "urgent", intensity: 0.8, source: "user" };
  beat.sfxCues = [
    {
      id: "sfx-1",
      kind: "thud",
      placement: "manual",
      offsetSeconds: 0,
      levelDb: -16,
      pan: 0,
      proximity: "room",
      duckMusic: false,
    },
  ];
  beat.editorial = { visualEditCues: [], silenceWindows: [] };

  const normalized = normalizeVideoPlan(plan);
  assert.equal(normalized.sections[0].beats[0].direction.voice.profile, "urgent");
  assert.equal(normalized.sections[0].beats[0].direction.sfxCues.length, 1);
  assert.deepEqual(normalized.sections[0].beats[0].direction.editorial, {
    visualEditCues: [],
    silenceWindows: [],
  });
});

test("normalizeVideoPlan preserves explicit direction values when both legacy and canonical fields exist", () => {
  const plan = makePlan();
  const beat = plan.sections[0].beats[0];
  beat.voiceDirection = { profile: "urgent", intensity: 0.8, source: "user" };
  beat.direction = {
    voice: { profile: "neutral", intensity: 0.5, source: "llm" },
    sfxCues: [],
    editorial: { visualEditCues: [], silenceWindows: [] },
  };

  const normalized = normalizeVideoPlan(plan);
  assert.equal(normalized.sections[0].beats[0].direction.voice.profile, "neutral");
  assert.equal(normalized.sections[0].beats[0].direction.voice.source, "llm");
});

test("normalizeVideoPlan canonicalizes voice pause fields to milliseconds", () => {
  const plan = makePlan();
  const beat = plan.sections[0].beats[0];
  beat.voiceDirection = { pauseBeforeSeconds: 0.2, pauseAfterSeconds: 0.4, source: "user" };
  beat.direction = {
    voice: { pauseBeforeSeconds: 0.333, pauseAfterMs: 250, source: "llm" },
  };

  const normalized = normalizeVideoPlan(plan);
  const voice = normalized.sections[0].beats[0].direction.voice;
  assert.equal(voice.pauseBeforeMs, 333);
  assert.equal(voice.pauseAfterMs, 250);
  assert.equal("pauseBeforeSeconds" in voice, false);
  assert.equal("pauseAfterSeconds" in voice, false);
});
