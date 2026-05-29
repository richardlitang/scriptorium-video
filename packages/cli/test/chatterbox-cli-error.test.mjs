import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

function runCli(args, env = {}, cwd = repoRoot) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliEntrypoint, ...args], {
      cwd,
      env: { ...process.env, ...env },
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

test("CLI prints Chatterbox setup errors without an uncaught stack trace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-cli-chatterbox-"));
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
    await writeJson(path.join(projectDir, "video-plan.json"), {
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
              id: "the-discovery-001",
              order: 1,
              narration: "Test narration for chatterbox error handling.",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              sfxCues: [],
            },
          ],
        },
      ],
    });
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const result = await runCli(
      [
        "generate:tts",
        "demo",
        "--provider",
        "chatterbox",
        "--only-beat",
        "the-discovery-001",
        "--force",
        "--no-cache",
      ],
      { CHATTERBOX_TTS_URL: "http://127.0.0.1:9/v1/audio/speech" },
      root,
    );

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Chatterbox TTS server is unreachable/);
    assert.match(result.stderr, /scripts\/chatterbox_tts_server\.py/);
    assert.doesNotMatch(result.stderr, /triggerUncaughtException/);
    assert.doesNotMatch(result.stderr, /node:internal/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
