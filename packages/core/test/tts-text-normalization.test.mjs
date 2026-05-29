import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generateTTSForProject } from "../dist/generate-tts.js";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("generateTTSForProject normalizes am/pm clock tokens before synthesis", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-tts-normalize-"));
  const previousCwd = process.cwd();
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    process.chdir(root);
    await mkdir(projectDir, { recursive: true });
    await writeJson(path.join(projectDir, "video-plan.json"), {
      schemaVersion: 1,
      title: "Fixture",
      mode: "short_story",
      targetPlatform: "local_only",
      stylePackId: "default",
      providers: {
        llm: "manual",
        tts: "manual",
        transcription: "mock",
        media: "manual-media",
        renderer: "remotion",
      },
      voice: { provider: "manual", voiceId: "alloy", format: "wav", options: {} },
      sections: [
        {
          id: "intro",
          title: "Intro",
          beats: [
            {
              id: "intro-001",
              order: 1,
              narration: "At 11:46 PM, Carlo whispered.",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeMs: 0,
                pauseAfterMs: 0,
                intensity: 0.5,
                speedMultiplier: 1,
                pitchOffset: 0,
                source: "default",
              },
              sfxCues: [],
            },
          ],
        },
      ],
    });
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const calls = [];
    const provider = {
      id: "manual",
      async listVoices() {
        return [];
      },
      async synthesize(request) {
        calls.push(request.text);
        await mkdir(path.dirname(request.outputPath), { recursive: true });
        await writeFile(request.outputPath, "stub", "utf8");
        return {
          audioPath: request.outputPath,
          durationSeconds: 1,
          providerId: "manual",
          voiceId: request.voiceId,
          inputHash: "",
        };
      },
    };

    await generateTTSForProject(projectId, provider);
    assert.equal(calls.length, 1);
    assert.equal(calls[0], "At 11 46 PM, Carlo whispered.");
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
  }
});

test("generateTTSForProject strips bracketed production directions before synthesis", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-tts-directive-normalize-"));
  const previousCwd = process.cwd();
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    process.chdir(root);
    await mkdir(projectDir, { recursive: true });
    await writeJson(path.join(projectDir, "video-plan.json"), {
      schemaVersion: 1,
      title: "Fixture",
      mode: "short_story",
      targetPlatform: "local_only",
      stylePackId: "default",
      providers: {
        llm: "manual",
        tts: "manual",
        transcription: "mock",
        media: "manual-media",
        renderer: "remotion",
      },
      voice: { provider: "manual", voiceId: "alloy", format: "wav", options: {} },
      sections: [
        {
          id: "intro",
          title: "Intro",
          beats: [
            {
              id: "intro-001",
              order: 1,
              narration:
                "The room went quiet. [BACKGROUND VISUAL: Slow pan to the crib.] Then the crib moved.",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeMs: 0,
                pauseAfterMs: 0,
                intensity: 0.5,
                speedMultiplier: 1,
                pitchOffset: 0,
                source: "default",
              },
              sfxCues: [],
            },
          ],
        },
      ],
    });
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const calls = [];
    const provider = {
      id: "manual",
      async listVoices() {
        return [];
      },
      async synthesize(request) {
        calls.push(request.text);
        await mkdir(path.dirname(request.outputPath), { recursive: true });
        await writeFile(request.outputPath, "stub", "utf8");
        return {
          audioPath: request.outputPath,
          durationSeconds: 1,
          providerId: "manual",
          voiceId: request.voiceId,
          inputHash: "",
        };
      },
    };

    await generateTTSForProject(projectId, provider);
    assert.equal(calls.length, 1);
    assert.equal(calls[0], "The room went quiet. Then the crib moved.");
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
  }
});

test("generateTTSForProject skips bracket-only production direction beats", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-tts-directive-skip-"));
  const previousCwd = process.cwd();
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    process.chdir(root);
    await mkdir(path.join(projectDir, "assets", "audio", "voice"), { recursive: true });
    await writeFile(
      path.join(projectDir, "assets", "audio", "voice", "stale.wav"),
      "bad audio",
      "utf8",
    );
    await writeJson(path.join(projectDir, "video-plan.json"), {
      schemaVersion: 1,
      title: "Fixture",
      mode: "short_story",
      targetPlatform: "local_only",
      stylePackId: "default",
      providers: {
        llm: "manual",
        tts: "manual",
        transcription: "mock",
        media: "manual-media",
        renderer: "remotion",
      },
      voice: { provider: "manual", voiceId: "alloy", format: "wav", options: {} },
      sections: [
        {
          id: "intro",
          title: "Intro",
          beats: [
            {
              id: "intro-001",
              order: 1,
              narration: "[BACKGROUND VISUAL: Slow pan to the crib.]",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeMs: 0,
                pauseAfterMs: 0,
                intensity: 0.5,
                speedMultiplier: 1,
                pitchOffset: 0,
                source: "default",
              },
              sfxCues: [],
            },
          ],
        },
      ],
    });
    await writeJson(path.join(projectDir, "asset-manifest.json"), {
      schemaVersion: 1,
      assets: [
        {
          id: "voice-intro-001",
          type: "audio",
          role: "voiceover",
          sectionId: "intro",
          beatId: "intro-001",
          path: "assets/audio/voice/stale.wav",
          source: {
            kind: "generated",
            provider: "manual",
            inputHash: "stale",
          },
          durationSeconds: 1,
          status: "generated",
          createdAt: "2026-05-21T00:00:00.000Z",
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
      ],
    });

    const calls = [];
    const provider = {
      id: "manual",
      async listVoices() {
        return [];
      },
      async synthesize(request) {
        calls.push(request.text);
        await mkdir(path.dirname(request.outputPath), { recursive: true });
        await writeFile(request.outputPath, "stub", "utf8");
        return {
          audioPath: request.outputPath,
          durationSeconds: 1,
          providerId: "manual",
          voiceId: request.voiceId,
          inputHash: "",
        };
      },
    };

    const result = await generateTTSForProject(projectId, provider, { force: true });
    assert.deepEqual(result.generated, []);
    assert.deepEqual(result.skipped, ["intro-001: no_spoken_narration"]);
    assert.deepEqual(calls, []);

    const manifest = JSON.parse(
      await readFile(path.join(projectDir, "asset-manifest.json"), "utf8"),
    );
    assert.equal(
      manifest.assets.some((asset) => asset.role === "voiceover" && asset.beatId === "intro-001"),
      false,
    );
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
  }
});
