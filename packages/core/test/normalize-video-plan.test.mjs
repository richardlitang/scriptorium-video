import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeVideoPlan, prepareVideoPlanForSchema } from "../dist/normalize-video-plan.js";

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

test("normalizeVideoPlan passes through canonical direction fields unchanged", () => {
  const plan = makePlan();
  const beat = plan.sections[0].beats[0];
  beat.direction = {
    voice: { profile: "urgent", intensity: 0.8, source: "user" },
    sfxCues: [
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
    ],
    editorial: { visualEditCues: [], silenceWindows: [] },
  };

  const normalized = normalizeVideoPlan(plan);
  assert.equal(normalized.sections[0].beats[0].direction.voice.profile, "urgent");
  assert.equal(normalized.sections[0].beats[0].direction.sfxCues.length, 1);
  assert.deepEqual(normalized.sections[0].beats[0].direction.editorial, {
    visualEditCues: [],
    silenceWindows: [],
  });
});

test("normalizeVideoPlan preserves millisecond pause values from direction.voice", () => {
  const plan = makePlan();
  const beat = plan.sections[0].beats[0];
  beat.direction = { voice: { pauseBeforeMs: 200, pauseAfterMs: 400, source: "user" } };

  const normalized = normalizeVideoPlan(plan);
  const voice = normalized.sections[0].beats[0].direction.voice;
  assert.equal(voice.pauseBeforeMs, 200);
  assert.equal(voice.pauseAfterMs, 400);
});

test("prepareVideoPlanForSchema strips draft-only visual metadata before strict parse", () => {
  const plan = makePlan({
    visualBible: {
      stylePreset: "cinematic_illustration",
      lookAndFeel: "grounded",
      palette: ["#111111"],
      eraAndLocation: "present day",
      characterAnchors: ["same lead"],
      characters: [{ id: "lead", name: "Lead" }],
      locations: [{ id: "street", name: "Street" }],
      objects: [{ id: "door", name: "Door" }],
      continuityRules: ["same wardrobe"],
      negativePrompt: "watermarks",
    },
  });
  const beat = plan.sections[0].beats[0];
  beat.media = [{ id: "beat-1-visual", type: "title_card", scaleMode: "safe_cover" }];
  beat.visual = {
    prompt: "Lead at the door",
    scaleMode: "safe_cover",
    subjectPosition: "center",
    cropRisk: "medium",
    motionStrength: "subtle",
    referenceIds: ["lead", "door"],
    referencePriority: "high",
  };
  beat.voiceDirection = { profile: "urgent", source: "llm" };
  beat.sfxCues = [];
  beat.editorial = { visualEditCues: [], silenceWindows: [] };

  const prepared = prepareVideoPlanForSchema(plan);
  assert.equal(Object.hasOwn(prepared.visualBible, "characters"), false);
  assert.equal(Object.hasOwn(prepared.visualBible, "locations"), false);
  assert.equal(Object.hasOwn(prepared.visualBible, "objects"), false);
  assert.equal(Object.hasOwn(prepared.sections[0].beats[0].visual, "scaleMode"), false);
  assert.equal(Object.hasOwn(prepared.sections[0].beats[0].visual, "referenceIds"), false);
  assert.equal(Object.hasOwn(prepared.sections[0].beats[0], "voiceDirection"), false);
  assert.equal(prepared.sections[0].beats[0].direction.voice.profile, "urgent");
});

test("prepareVideoPlanForSchema removes visual objects containing only draft metadata", () => {
  const plan = makePlan({
    visualBible: {
      characters: [{ id: "lead", name: "Lead" }],
    },
  });
  plan.sections[0].beats[0].visual = {
    scaleMode: "safe_cover",
    referenceIds: ["lead"],
  };

  const prepared = prepareVideoPlanForSchema(plan);

  assert.equal(prepared.visualBible, undefined);
  assert.equal(prepared.sections[0].beats[0].visual, undefined);
});
