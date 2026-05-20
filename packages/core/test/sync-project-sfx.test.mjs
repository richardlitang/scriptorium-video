import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { syncProject } from "../dist/sync-project.js";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("syncProject auto-resolves missing cue assets from local sfx library", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-sync-sfx-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await mkdir(path.join(root, "content", "sfx"), { recursive: true });
    await writeFile(path.join(root, "content", "sfx", "door-knock.wav"), "stub", "utf8");
    await mkdir(path.join(projectDir, "assets", "audio", "voice"), { recursive: true });
    await writeFile(path.join(projectDir, "assets", "audio", "voice", "intro-001.wav"), "stub", "utf8");

    await writeJson(path.join(projectDir, "video-plan.json"), {
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
        renderer: "remotion"
      },
      voice: {
        provider: "chatterbox",
        voiceId: "clone",
        format: "wav",
        options: {}
      },
      sections: [
        {
          id: "intro",
          title: "Intro",
          beats: [
            {
              id: "intro-001",
              order: 1,
              narration: "Knock knock.",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeSeconds: 0,
                pauseAfterSeconds: 0,
                intensity: 0.5,
                speedMultiplier: 1,
                pitchOffset: 0,
                source: "default"
              },
              sfxCues: [
                {
                  id: "cue-1",
                  kind: "door knock",
                  placement: "beat_start",
                  offsetSeconds: 0,
                  levelDb: -14
                }
              ]
            }
          ]
        }
      ]
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
          path: "assets/audio/voice/intro-001.wav",
          source: { kind: "generated", provider: "chatterbox", inputHash: "x" },
          durationSeconds: 2,
          status: "generated",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    });

    const result = await syncProject(projectId, root);
    const manifest = JSON.parse(await readFile(path.join(projectDir, "asset-manifest.json"), "utf8"));
    assert.ok(manifest.assets.some((asset) => asset.id === "sfx-lib-door-knock"));
    assert.ok(result.timeline.segments[0].audioCues.some((cue) => cue.assetId === "sfx-lib-door-knock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

