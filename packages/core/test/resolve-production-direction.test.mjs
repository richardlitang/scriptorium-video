import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBeatProductionDirection } from "../dist/resolve-production-direction.js";
import { VideoPlanSchema } from "../dist/schemas/video-plan.schema.js";

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
      renderer: "remotion",
    },
    voice: {
      provider: "chatterbox",
      voiceId: "clone",
      format: "wav",
      options: {
        speed: 0.92,
      },
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
            sfxCues: [],
          },
        ],
      },
    ],
  };
}

test("resolveBeatProductionDirection applies project -> section -> beat precedence", () => {
  const plan = basePlan();
  plan.direction = {
    voice: { intensity: 0.35, profile: "neutral", source: "default" },
    caption: { style: "project-style", emphasis: ["project"] },
    creative: { feel: "project feel", pacing: "project pacing", visualStyle: "project visual" },
  };
  plan.sections[0].direction = {
    voice: { intensity: 0.55, profile: "reflective", source: "llm" },
    caption: { style: "section-style", emphasis: ["section"] },
    creative: { pacing: "section pacing" },
  };
  plan.sections[0].beats[0].direction = {
    voice: { intensity: 0.9, speedMultiplier: 1.2, source: "user" },
    caption: { emphasis: ["beat"] },
    creative: { visualStyle: "beat visual" },
  };

  const resolved = resolveBeatProductionDirection(
    plan,
    plan.sections[0],
    plan.sections[0].beats[0],
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

test("resolveBeatProductionDirection resolves visual intent with beat precedence", () => {
  const plan = basePlan();
  plan.direction = {
    visual: {
      coverageRole: "supporting",
      priority: 2,
      needsUniqueImage: false,
      reusePolicy: "allow-reuse",
      source: "llm",
    },
  };
  plan.sections[0].direction = {
    visual: {
      coverageRole: "key_moment",
      priority: 4,
      needsUniqueImage: true,
      reusePolicy: "none",
      source: "llm",
    },
  };
  plan.sections[0].beats[0].visual = {
    coverageRole: "anchor",
    priority: 5,
    needsUniqueImage: true,
    reusePolicy: "none",
    source: "user",
  };

  const resolved = resolveBeatProductionDirection(
    plan,
    plan.sections[0],
    plan.sections[0].beats[0],
  );

  assert.equal(resolved.visual?.coverageRole, "anchor");
  assert.equal(resolved.visual?.priority, 5);
  assert.equal(resolved.visual?.source, "user");
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
    source: "llm",
  };
  plan.sections[0].beats[0].caption = {
    style: "legacy-style",
    emphasis: ["legacy-caption"],
  };
  plan.sections[0].beats[0].sfxCues = [
    {
      id: "cue-1",
      kind: "knock",
      placement: "beat_start",
      offsetSeconds: 0,
      levelDb: -16,
    },
  ];

  const resolved = resolveBeatProductionDirection(
    plan,
    plan.sections[0],
    plan.sections[0].beats[0],
  );

  assert.equal(resolved.voiceDirection.profile, "key_point");
  assert.equal(resolved.voiceDirection.deliveryNote, "legacy");
  assert.equal(resolved.caption.style, "legacy-style");
  assert.deepEqual(resolved.caption.emphasis, ["legacy-caption"]);
  assert.equal(resolved.sfxCues.length, 1);
  assert.equal(resolved.sfxCues[0].kind, "knock");
});

test("resolveBeatProductionDirection canonicalizes voice pauses to millisecond precision", () => {
  const plan = basePlan();
  plan.direction = {
    voice: {
      pauseBeforeSeconds: 0.333,
      pauseAfterMs: 640,
      pauseAfterSeconds: 0.1,
      source: "llm",
    },
  };

  const resolved = resolveBeatProductionDirection(
    plan,
    plan.sections[0],
    plan.sections[0].beats[0],
  );

  assert.equal(resolved.voiceDirection.pauseBeforeMs, 333);
  assert.equal(resolved.voiceDirection.pauseAfterMs, 640);
  assert.equal(resolved.voiceDirection.pauseBeforeSeconds, undefined);
  assert.equal(resolved.voiceDirection.pauseAfterSeconds, undefined);
});

test("VideoPlan schema accepts 16:9 aspect ratio overrides", () => {
  const plan = basePlan();
  plan.overrides = {
    aspectRatio: "16:9",
    resolution: { width: 1920, height: 1080 },
  };

  const parsed = VideoPlanSchema.parse(plan);

  assert.equal(parsed.overrides.aspectRatio, "16:9");
});

test("VideoPlan schema accepts orchestration metadata", () => {
  const plan = basePlan();
  plan.orchestration = {
    version: 1,
    model: "gpt-5.4",
    orchestratedAt: "2026-05-20T12:00:00.000Z",
    warnings: ["minor continuity uncertainty"],
  };
  const parsed = VideoPlanSchema.parse(plan);
  assert.equal(parsed.orchestration?.version, 1);
  assert.equal(parsed.orchestration?.model, "gpt-5.4");
  assert.deepEqual(parsed.orchestration?.warnings, ["minor continuity uncertainty"]);
});
