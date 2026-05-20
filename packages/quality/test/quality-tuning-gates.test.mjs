import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runQualityChecks } from "../dist/index.js";
import { syncProject } from "@lvstudio/core";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("quality checks include tuning-related warnings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-quality-gates-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await writeJson(path.join(projectDir, "project.json"), {
      schemaVersion: 1,
      id: projectId,
      title: "Fixture",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "draft"
    });
    await writeJson(path.join(projectDir, "video-plan.json"), {
      schemaVersion: 1,
      title: "Fixture",
      mode: "short_story",
      targetPlatform: "local_only",
      stylePackId: "default",
      templateId: "vertical-story",
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
          id: "s1",
          title: "S1",
          beats: [
            {
              id: "s1-001",
              order: 1,
              narration: "A",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [{ id: "m1", type: "title_card", role: "primary_visual", prompt: "same prompt", scaleMode: "cover", placement: "background" }],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: { profile: "neutral", emphasis: [], pauseBeforeSeconds: 0.8, pauseAfterSeconds: 0.8, intensity: 0.1, speedMultiplier: 1, pitchOffset: 0, source: "llm" },
              sfxCues: []
            },
            {
              id: "s1-002",
              order: 2,
              narration: "B",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [{ id: "m2", type: "title_card", role: "primary_visual", prompt: "same prompt", scaleMode: "cover", placement: "background" }],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: { profile: "neutral", emphasis: [], pauseBeforeSeconds: 0, pauseAfterSeconds: 0, intensity: 0.9, speedMultiplier: 1, pitchOffset: 0, source: "llm" },
              sfxCues: []
            },
            {
              id: "s1-003",
              order: 3,
              narration: "C",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [{ id: "m3", type: "title_card", role: "primary_visual", prompt: "same prompt", scaleMode: "cover", placement: "background" }],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: { profile: "neutral", emphasis: [], pauseBeforeSeconds: 0, pauseAfterSeconds: 0, intensity: 0.2, speedMultiplier: 1, pitchOffset: 0, source: "llm" },
              sfxCues: []
            }
          ]
        }
      ]
    });
    await mkdir(path.join(projectDir, "assets", "audio", "voice"), { recursive: true });
    for (const beatId of ["s1-001", "s1-002", "s1-003"]) {
      await writeFile(path.join(projectDir, "assets", "audio", "voice", `${beatId}.wav`), "stub", "utf8");
    }
    await writeJson(path.join(projectDir, "asset-manifest.json"), {
      schemaVersion: 1,
      assets: ["s1-001", "s1-002", "s1-003"].map((beatId) => ({
        id: `voice-${beatId}`,
        type: "audio",
        role: "voiceover",
        sectionId: "s1",
        beatId,
        path: `assets/audio/voice/${beatId}.wav`,
        source: { kind: "generated", provider: "chatterbox", inputHash: beatId },
        durationSeconds: 3,
        status: "generated",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
    });
    await writeJson(path.join(projectDir, "captions", "captions.json"), {
      schemaVersion: 1,
      status: "generated",
      source: { transcriptionProvider: "mock", audioAssetIds: [] },
      captions: []
    });

    await syncProject(projectId, root);
    const result = await runQualityChecks(projectId, root);
    const ids = result.checks.map((check) => check.id);
    assert.ok(ids.includes("shared.voice.pause_budget"));
    assert.ok(ids.includes("shared.voice.intensity_jump"));
    assert.ok(ids.includes("shared.visual.prompt_repetition"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
