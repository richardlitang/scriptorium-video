import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBeatProductionDirection } from "../dist/resolve-production-direction.js";

function basePlan() {
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
      renderer: "remotion"
    },
    voice: {
      provider: "chatterbox",
      voiceId: "clone",
      format: "wav",
      options: {
        speed: 0.92
      }
    },
    sections: [
      {
        id: "intro",
        title: "Intro",
        beats: [
          {
            id: "intro-001",
            order: 1,
            narration: "hello",
            timing: { locked: false, mediaPolicy: "loop_or_freeze" },
            media: [],
            motion: { type: "slow_zoom_in", intensity: 0.1 },
            caption: { style: "default", emphasis: [] },
            sfxCues: []
          }
        ]
      }
    ]
  };
}

test("resolveBeatProductionDirection applies project -> section -> beat precedence", () => {
  const plan = basePlan();
  plan.direction = {
    voice: { intensity: 0.35, profile: "neutral", source: "default" },
    caption: { style: "project-style", emphasis: ["project"] },
    creative: { feel: "project feel", pacing: "project pacing", visualStyle: "project visual" }
  };
  plan.sections[0].direction = {
    voice: { intensity: 0.55, profile: "reflective", source: "llm" },
    caption: { style: "section-style", emphasis: ["section"] },
    creative: { pacing: "section pacing" }
  };
  plan.sections[0].beats[0].direction = {
    voice: { intensity: 0.9, speedMultiplier: 1.2, source: "user" },
    caption: { emphasis: ["beat"] },
    creative: { visualStyle: "beat visual" }
  };

  const resolved = resolveBeatProductionDirection(
    plan,
    plan.sections[0],
    plan.sections[0].beats[0]
  );

  assert.equal(resolved.voiceDirection.intensity, 0.9);
  assert.equal(resolved.voiceDirection.profile, "reflective");
  assert.equal(resolved.voiceDirection.speedMultiplier, 1.2);
  assert.equal(resolved.caption.style, "section-style");
  assert.deepEqual(resolved.caption.emphasis, ["beat"]);
  assert.equal(resolved.creative.feel, "project feel");
  assert.equal(resolved.creative.pacing, "section pacing");
  assert.equal(resolved.creative.visualStyle, "beat visual");
});

test("resolveBeatProductionDirection preserves legacy beat fields as final fallback", () => {
  const plan = basePlan();
  plan.sections[0].beats[0].voiceDirection = {
    profile: "key_point",
    deliveryNote: "legacy",
    emphasis: ["legacy emphasis"],
    pauseBeforeSeconds: 0.1,
    pauseAfterSeconds: 0.2,
    intensity: 0.6,
    speedMultiplier: 1.1,
    pitchOffset: 0.2,
    source: "llm"
  };
  plan.sections[0].beats[0].caption = {
    style: "legacy-style",
    emphasis: ["legacy-caption"]
  };
  plan.sections[0].beats[0].sfxCues = [
    {
      id: "cue-1",
      kind: "knock",
      placement: "beat_start",
      offsetSeconds: 0,
      levelDb: -16
    }
  ];

  const resolved = resolveBeatProductionDirection(
    plan,
    plan.sections[0],
    plan.sections[0].beats[0]
  );

  assert.equal(resolved.voiceDirection.profile, "key_point");
  assert.equal(resolved.voiceDirection.deliveryNote, "legacy");
  assert.equal(resolved.caption.style, "legacy-style");
  assert.deepEqual(resolved.caption.emphasis, ["legacy-caption"]);
  assert.equal(resolved.sfxCues.length, 1);
  assert.equal(resolved.sfxCues[0].kind, "knock");
});
