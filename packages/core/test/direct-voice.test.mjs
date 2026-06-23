import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { applyVoiceDirectionPlan, directVoiceProject } from "../dist/direct-voice.js";

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
            direction: {
              voice: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeMs: 0,
                pauseAfterMs: 0,
                intensity: 0.5,
                source: "default",
              },
              sfxCues: [],
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
            direction: {
              voice: {
                profile: "authoritative",
                emphasis: [],
                pauseBeforeMs: 0,
                pauseAfterMs: 0,
                intensity: 0.5,
                source: "user",
              },
              sfxCues: [],
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
          pauseBeforeMs: 200,
          pauseAfterMs: 400,
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
  assert.equal(beat.direction.voice.profile, "key_point");
  assert.deepEqual(beat.caption.emphasis, ["first", "save", "hours"]);
  assert.equal(beat.direction.sfxCues[0].id, "cue-1");
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
          pauseBeforeMs: 200,
          pauseAfterMs: 300,
          intensity: 0.8,
          source: "llm",
        },
        captionEmphasis: [],
        sfxCues: [],
      },
    ],
  };

  const noForce = applyVoiceDirectionPlan(plan, output);
  assert.equal(noForce.sections[0].beats[1].direction.voice.profile, "authoritative");

  const force = applyVoiceDirectionPlan(plan, output, { force: true });
  assert.equal(force.sections[0].beats[1].direction.voice.profile, "reveal");
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
          pauseBeforeMs: 300,
          pauseAfterMs: 400,
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
  assert.equal(beat.direction.voice.profile, "neutral");
  assert.deepEqual(beat.caption.emphasis, ["first"]);
  assert.equal(beat.direction.sfxCues.length, 0);
});

test("directVoiceProject applies a directed voice file inside an explicit project root", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "lvstudio-direct-voice-"));
  const projectDir = path.join(rootDir, "content", "projects", "demo");
  await mkdir(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, "video-plan.json"), `${JSON.stringify(samplePlan())}\n`);
  const directionPath = path.join(rootDir, "voice-direction.json");
  await writeFile(
    directionPath,
    `${JSON.stringify({
      beats: [
        {
          beatId: "beat-1",
          voiceDirection: {
            profile: "urgent",
            emphasis: ["now"],
            pauseBeforeMs: 100,
            pauseAfterMs: 200,
            intensity: 0.9,
            source: "llm",
          },
          captionEmphasis: ["now"],
          sfxCues: [],
        },
      ],
    })}\n`,
  );

  const result = await directVoiceProject("demo", { rootDir, fromFile: directionPath });

  assert.deepEqual(result, {
    beatUpdates: 1,
    videoPlanPath: path.join(projectDir, "video-plan.json"),
  });
  const updated = JSON.parse(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
  assert.equal(updated.sections[0].beats[0].direction.voice.profile, "urgent");
  assert.deepEqual(updated.sections[0].beats[0].caption.emphasis, ["first", "now"]);
});
