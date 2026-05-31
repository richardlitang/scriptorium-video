import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { migrateVideoPlan } from "../dist/migrate-video-plan.js";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makePlan(projectId) {
  return {
    schemaVersion: 1,
    title: "Fixture",
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
        id: "s1",
        title: "Section 1",
        beats: [
          {
            id: `${projectId}-b1`,
            order: 1,
            narration: "Hello world",
            timing: { locked: false, mediaPolicy: "loop_or_freeze" },
            media: [],
            motion: { type: "slow_zoom_in", intensity: 0.1 },
            caption: { emphasis: [], style: "default" },
            direction: {
              voice: {
                profile: "urgent",
                pauseBeforeMs: 200,
                pauseAfterMs: 400,
                intensity: 0.8,
                source: "user",
              },
              sfxCues: [],
              editorial: { visualEditCues: [], silenceWindows: [] },
            },
          },
        ],
      },
    ],
  };
}

test("migrateVideoPlan writes canonical beat direction and strips legacy fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-core-migrate-plan-"));
  const projectId = "fixture";
  const planPath = path.join(root, "content", "projects", projectId, "video-plan.json");
  try {
    await writeJson(planPath, makePlan(projectId));
    const result = await migrateVideoPlan(projectId, { rootDir: root, write: true });

    assert.equal(result.projectId, projectId);
    assert.equal(result.path, planPath);

    const migrated = JSON.parse(await readFile(planPath, "utf8"));
    const beat = migrated.sections[0].beats[0];
    assert.equal(beat.direction.voice.profile, "urgent");
    assert.equal(beat.direction.voice.pauseBeforeMs, 200);
    assert.equal(beat.direction.voice.pauseAfterMs, 400);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrateVideoPlan dry-run reports change without writing file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-core-migrate-plan-dry-"));
  const projectId = "fixture";
  const planPath = path.join(root, "content", "projects", projectId, "video-plan.json");
  try {
    const original = makePlan(projectId);
    await writeJson(planPath, original);

    const result = await migrateVideoPlan(projectId, { rootDir: root, write: false });
    assert.equal(result.written, false);

    const afterDryRun = JSON.parse(await readFile(planPath, "utf8"));
    assert.deepEqual(afterDryRun, original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
