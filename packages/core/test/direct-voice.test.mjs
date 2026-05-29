import assert from "node:assert/strict";
import { test } from "node:test";
import { applyVoiceDirectionPlan } from "../dist/direct-voice.js";

function samplePlan() {
  return {
    schemaVersion: 1,
    title: "Sample",
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
    voice: { provider: "chatterbox", voiceId: "clone", format: "wav", options: {} },
    sections: [
      {
        id: "section-1",
        title: "Section 1",
        beats: [
          {
            id: "beat-1",
            order: 1,
            narration: "First line.",
            timing: { locked: false, mediaPolicy: "loop_or_freeze" },
            media: [],
            motion: { type: "slow_zoom_in", intensity: 0.1 },
            caption: { emphasis: ["first"], style: "default" },
            sfxCues: [],
            voiceDirection: {
              profile: "neutral",
              emphasis: [],
              pauseBeforeSeconds: 0,
              pauseAfterSeconds: 0,
              intensity: 0.5,
              source: "default",
            },
          },
          {
            id: "beat-2",
            order: 2,
            narration: "Second line.",
            timing: { locked: false, mediaPolicy: "loop_or_freeze" },
            media: [],
            motion: { type: "slow_zoom_in", intensity: 0.1 },
            caption: { emphasis: [], style: "default" },
            sfxCues: [],
            voiceDirection: {
              profile: "authoritative",
              emphasis: [],
              pauseBeforeSeconds: 0,
              pauseAfterSeconds: 0,
              intensity: 0.5,
              source: "user",
            },
          },
        ],
      },
    ],
  };
}

test("applyVoiceDirectionPlan applies direction and merges emphasis", () => {
  const plan = samplePlan();
  const next = applyVoiceDirectionPlan(plan, {
    beats: [
      {
        beatId: "beat-1",
        voiceDirection: {
          profile: "key_point",
          deliveryNote: "Emphasize the claim.",
          emphasis: ["hours"],
          pauseBeforeSeconds: 0.2,
          pauseAfterSeconds: 0.4,
          intensity: 0.7,
          source: "llm",
        },
        captionEmphasis: ["save", "hours"],
        sfxCues: [
          {
            id: "cue-1",
            kind: "soft_impact",
            placement: "key_point",
            offsetSeconds: 0,
            levelDb: -16,
          },
        ],
      },
    ],
  });

  const beat = next.sections[0].beats[0];
  assert.equal(beat.voiceDirection.profile, "key_point");
  assert.deepEqual(beat.caption.emphasis, ["first", "save", "hours"]);
  assert.equal(beat.sfxCues[0].id, "cue-1");
});

test("applyVoiceDirectionPlan preserves user direction unless force is true", () => {
  const plan = samplePlan();
  const output = {
    beats: [
      {
        beatId: "beat-2",
        voiceDirection: {
          profile: "reveal",
          emphasis: [],
          pauseBeforeSeconds: 0.2,
          pauseAfterSeconds: 0.3,
          intensity: 0.8,
          source: "llm",
        },
        captionEmphasis: [],
        sfxCues: [],
      },
    ],
  };

  const noForce = applyVoiceDirectionPlan(plan, output);
  assert.equal(noForce.sections[0].beats[1].voiceDirection.profile, "authoritative");

  const force = applyVoiceDirectionPlan(plan, output, { force: true });
  assert.equal(force.sections[0].beats[1].voiceDirection.profile, "reveal");
});

test("applyVoiceDirectionPlan respects directionMeta locks", () => {
  const plan = samplePlan();
  plan.sections[0].beats[0].directionMeta = {
    lockedPaths: ["voice", "caption.emphasis", "sfx"],
    sources: {},
  };
  const output = {
    beats: [
      {
        beatId: "beat-1",
        voiceDirection: {
          profile: "reveal",
          emphasis: ["new"],
          pauseBeforeSeconds: 0.3,
          pauseAfterSeconds: 0.4,
          intensity: 0.8,
          source: "llm",
        },
        captionEmphasis: ["new"],
        sfxCues: [
          { id: "cue-2", kind: "hit", placement: "beat_start", offsetSeconds: 0, levelDb: -18 },
        ],
      },
    ],
  };

  const next = applyVoiceDirectionPlan(plan, output);
  const beat = next.sections[0].beats[0];
  assert.equal(beat.voiceDirection.profile, "neutral");
  assert.deepEqual(beat.caption.emphasis, ["first"]);
  assert.equal(beat.sfxCues.length, 0);
});
