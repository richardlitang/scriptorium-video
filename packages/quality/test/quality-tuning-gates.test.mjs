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
      status: "draft",
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
          title: "S1",
          beats: [
            {
              id: "s1-001",
              order: 1,
              narration: "A [BACKGROUND VISUAL: Slow pan to the crib.]",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [
                {
                  id: "m1",
                  type: "title_card",
                  role: "primary_visual",
                  prompt: "same prompt",
                  scaleMode: "cover",
                  placement: "background",
                },
              ],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeMs: 800,
                pauseAfterMs: 800,
                pauseBeforeSeconds: 0.2,
                pauseAfterSeconds: 0.2,
                intensity: 0.1,
                speedMultiplier: 1,
                pitchOffset: 0,
                source: "llm",
              },
              sfxCues: [],
              editorial: {
                visualEditCues: [
                  {
                    id: "v1",
                    type: "hard_cut",
                    placement: "beat_start",
                    offsetSeconds: 0,
                    durationSeconds: 0.3,
                    target: "current_visual",
                    intensity: 0.6,
                  },
                  {
                    id: "v2",
                    type: "j_cut",
                    placement: "manual",
                    offsetSeconds: 0.4,
                    durationSeconds: 0.3,
                    target: "current_visual",
                    intensity: 0.5,
                  },
                  {
                    id: "v3",
                    type: "l_cut",
                    placement: "manual",
                    offsetSeconds: 0.8,
                    durationSeconds: 0.3,
                    target: "next_visual",
                    intensity: 0.5,
                  },
                  {
                    id: "v4",
                    type: "smash_cut",
                    placement: "manual",
                    offsetSeconds: 1.2,
                    durationSeconds: 0.2,
                    target: "current_visual",
                    intensity: 0.8,
                  },
                ],
                silenceWindows: [
                  {
                    id: "sw1",
                    placement: "manual",
                    offsetSeconds: 0.3,
                    durationSeconds: 1.5,
                    muteMusic: true,
                    muteSfx: true,
                    keepVoice: false,
                  },
                  {
                    id: "sw2",
                    placement: "manual",
                    offsetSeconds: 1.1,
                    durationSeconds: 1.4,
                    muteMusic: true,
                    muteSfx: true,
                    keepVoice: false,
                  },
                ],
              },
            },
            {
              id: "s1-002",
              order: 2,
              narration: "B",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [
                {
                  id: "m2",
                  type: "title_card",
                  role: "primary_visual",
                  prompt: "same prompt",
                  scaleMode: "cover",
                  placement: "background",
                },
              ],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeMs: 0,
                pauseAfterMs: 0,
                intensity: 0.9,
                speedMultiplier: 1,
                pitchOffset: 0,
                source: "llm",
              },
              sfxCues: [],
            },
            {
              id: "s1-003",
              order: 3,
              narration: "C",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [
                {
                  id: "m3",
                  type: "title_card",
                  role: "primary_visual",
                  prompt: "same prompt",
                  scaleMode: "cover",
                  placement: "background",
                },
              ],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              voiceDirection: {
                profile: "neutral",
                emphasis: [],
                pauseBeforeMs: 0,
                pauseAfterMs: 0,
                intensity: 0.2,
                speedMultiplier: 1,
                pitchOffset: 0,
                source: "llm",
              },
              sfxCues: [],
              editorial: {
                endingPolicy: {
                  cutToBlack: true,
                  holdSeconds: 0.2,
                  audioPolicy: "hard_silence",
                  avoidOutro: true,
                },
              },
            },
          ],
        },
      ],
    });
    await mkdir(path.join(projectDir, "assets", "audio", "voice"), { recursive: true });
    await mkdir(path.join(projectDir, "assets", "images"), { recursive: true });
    for (const beatId of ["s1-001", "s1-002", "s1-003"]) {
      await writeFile(
        path.join(projectDir, "assets", "audio", "voice", `${beatId}.wav`),
        "stub",
        "utf8",
      );
      await writeFile(path.join(projectDir, "assets", "images", `${beatId}.png`), "stub", "utf8");
    }
    await writeJson(path.join(projectDir, "asset-manifest.json"), {
      schemaVersion: 1,
      assets: ["s1-001", "s1-002", "s1-003"].flatMap((beatId) => [
        {
          id: `voice-${beatId}`,
          type: "audio",
          role: "voiceover",
          sectionId: "s1",
          beatId,
          path: `assets/audio/voice/${beatId}.wav`,
          source: { kind: "generated", provider: "chatterbox", inputHash: beatId },
          durationSeconds: beatId === "s1-002" ? 20 : 3,
          status: "generated",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `image-${beatId}`,
          type: "image",
          role: "primary_visual",
          sectionId: "s1",
          beatId,
          path: `assets/images/${beatId}.png`,
          source: { kind: "generated", provider: "test", inputHash: beatId },
          status: "generated",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    });
    await writeJson(path.join(projectDir, "captions", "captions.json"), {
      schemaVersion: 1,
      status: "generated",
      source: { transcriptionProvider: "mock", audioAssetIds: [] },
      captions: [],
    });

    await syncProject(projectId, root);
    const result = await runQualityChecks(projectId, root);
    const ids = result.checks.map((check) => check.id);
    assert.ok(ids.includes("shared.plan.legacy_beat_fields"));
    assert.ok(ids.includes("shared.plan.legacy_pause_seconds_fields"));
    assert.ok(ids.includes("shared.voice.pause_budget"));
    assert.ok(ids.includes("shared.voice.pause_conflict"));
    assert.ok(ids.includes("shared.narration.production_directive"));
    assert.ok(ids.includes("shared.voice.intensity_jump"));
    assert.ok(ids.includes("shared.voice.duration_outlier"));
    assert.ok(ids.includes("shared.visual.prompt_repetition"));
    assert.ok(ids.includes("shared.editorial.visual_cue_density"));
    assert.ok(ids.includes("shared.editorial.silence_overlap"));
    assert.ok(ids.includes("shared.editorial.silence_overuse"));
    assert.ok(ids.includes("short_story.ending_black_hold"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
