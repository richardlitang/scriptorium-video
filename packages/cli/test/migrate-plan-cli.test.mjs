import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../../..", import.meta.url);
const cliEntrypoint = fileURLToPath(new URL("../dist/index.js", import.meta.url));

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runCli(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliEntrypoint, ...args], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function samplePlan(projectId) {
  return {
    schemaVersion: 1,
    title: "Demo",
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
    voice: { provider: "chatterbox", voiceId: "alloy", format: "wav", options: {} },
    sections: [
      {
        id: "intro",
        title: "Intro",
        beats: [
          {
            id: `${projectId}-beat-1`,
            order: 1,
            narration: "Test narration for migration.",
            timing: { mediaPolicy: "loop_or_freeze", locked: false },
            media: [],
            motion: { type: "none", intensity: 0 },
            caption: { emphasis: [], style: "default" },
            voiceDirection: {
              profile: "urgent",
              intensity: 0.8,
              pauseBeforeSeconds: 0.2,
              pauseAfterSeconds: 0.4,
              source: "user",
            },
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
          },
        ],
      },
    ],
  };
}

test("migrate:plan rewrites legacy beat fields into canonical direction", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-cli-migrate-plan-"));
  const projectId = "demo";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await writeJson(path.join(projectDir, "project.json"), {
      schemaVersion: 1,
      id: projectId,
      title: "Demo",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      status: "draft",
    });
    await writeJson(path.join(projectDir, "video-plan.json"), samplePlan(projectId));
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const result = await runCli(["migrate:plan", projectId], root);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Migrated plan for demo/);
    assert.equal(result.stderr, "");

    const migrated = JSON.parse(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
    const beat = migrated.sections[0].beats[0];
    assert.equal(beat.direction.voice.profile, "urgent");
    assert.equal(beat.direction.voice.pauseBeforeMs, 200);
    assert.equal(beat.direction.voice.pauseAfterMs, 400);
    assert.equal(Object.hasOwn(beat.direction.voice, "pauseBeforeSeconds"), false);
    assert.equal(Object.hasOwn(beat.direction.voice, "pauseAfterSeconds"), false);
    assert.equal(Object.hasOwn(beat, "voiceDirection"), false);
    assert.equal(Object.hasOwn(beat, "sfxCues"), false);
    assert.equal(Object.hasOwn(beat, "editorial"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrate:plan --dry-run reports migration without modifying file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-cli-migrate-plan-dry-"));
  const projectId = "demo";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await writeJson(path.join(projectDir, "project.json"), {
      schemaVersion: 1,
      id: projectId,
      title: "Demo",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      status: "draft",
    });
    const originalPlan = samplePlan(projectId);
    await writeJson(path.join(projectDir, "video-plan.json"), originalPlan);
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const result = await runCli(["migrate:plan", projectId, "--dry-run"], root);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Plan migration needed for demo/);
    assert.equal(result.stderr, "");

    const afterDryRun = JSON.parse(
      await readFile(path.join(projectDir, "video-plan.json"), "utf8"),
    );
    assert.deepEqual(afterDryRun, originalPlan);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrate:plan --all migrates every local project", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-cli-migrate-plan-all-"));
  const projectIds = ["alpha", "beta"];
  try {
    for (const projectId of projectIds) {
      const projectDir = path.join(root, "content", "projects", projectId);
      await writeJson(path.join(projectDir, "project.json"), {
        schemaVersion: 1,
        id: projectId,
        title: projectId,
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        status: "draft",
      });
      await writeJson(path.join(projectDir, "video-plan.json"), samplePlan(projectId));
      await writeJson(path.join(projectDir, "asset-manifest.json"), {
        schemaVersion: 1,
        assets: [],
      });
    }

    const result = await runCli(["migrate:plan", "--all"], root);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Migrated plan for alpha/);
    assert.match(result.stdout, /Migrated plan for beta/);
    assert.match(result.stdout, /Migrated 2 projects; 2 changed\./);
    assert.equal(result.stderr, "");

    for (const projectId of projectIds) {
      const projectDir = path.join(root, "content", "projects", projectId);
      const migrated = JSON.parse(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
      const beat = migrated.sections[0].beats[0];
      assert.equal(beat.direction.voice.profile, "urgent");
      assert.equal(Object.hasOwn(beat, "voiceDirection"), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrate:plan --all --dry-run reports needed migrations without writing files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-cli-migrate-plan-all-dry-"));
  const projectId = "gamma";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await writeJson(path.join(projectDir, "project.json"), {
      schemaVersion: 1,
      id: projectId,
      title: projectId,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      status: "draft",
    });
    const originalPlan = samplePlan(projectId);
    await writeJson(path.join(projectDir, "video-plan.json"), originalPlan);
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const result = await runCli(["migrate:plan", "--all", "--dry-run"], root);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Plan migration needed for gamma/);
    assert.match(result.stdout, /Dry-run 1 projects; 1 changed\./);
    assert.equal(result.stderr, "");

    const afterDryRun = JSON.parse(
      await readFile(path.join(projectDir, "video-plan.json"), "utf8"),
    );
    assert.deepEqual(afterDryRun, originalPlan);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrate:plan canonicalizes pause seconds on canonical direction.voice", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-cli-migrate-plan-direction-voice-"));
  const projectId = "delta";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await writeJson(path.join(projectDir, "project.json"), {
      schemaVersion: 1,
      id: projectId,
      title: projectId,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      status: "draft",
    });
    const plan = samplePlan(projectId);
    plan.sections[0].beats[0].direction = {
      voice: {
        profile: "neutral",
        source: "llm",
        pauseBeforeSeconds: 0.333,
        pauseAfterSeconds: 0.111,
      },
    };
    await writeJson(path.join(projectDir, "video-plan.json"), plan);
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const result = await runCli(["migrate:plan", projectId], root);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");

    const migrated = JSON.parse(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
    const voice = migrated.sections[0].beats[0].direction.voice;
    assert.equal(voice.profile, "neutral");
    assert.equal(voice.pauseBeforeMs, 333);
    assert.equal(voice.pauseAfterMs, 111);
    assert.equal(Object.hasOwn(voice, "pauseBeforeSeconds"), false);
    assert.equal(Object.hasOwn(voice, "pauseAfterSeconds"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrate:plan rejects missing target selector", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-cli-migrate-plan-missing-"));
  try {
    const result = await runCli(["migrate:plan"], root);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Provide <project-id> or pass --all\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrate:plan rejects combining --all with explicit project id", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "lvstudio-cli-migrate-plan-mutually-exclusive-"),
  );
  try {
    const result = await runCli(["migrate:plan", "demo", "--all"], root);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Pass either --all or <project-id>, not both\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
