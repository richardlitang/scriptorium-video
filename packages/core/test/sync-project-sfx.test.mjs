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

test("syncProject maps editorial cues and sound cue mix controls into timeline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-sync-editorial-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await mkdir(path.join(root, "content", "sfx"), { recursive: true });
    await writeFile(path.join(root, "content", "sfx", "whisper.wav"), "stub", "utf8");
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
              narration: "Whisper.",
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
                  kind: "whisper",
                  placement: "beat_end",
                  offsetSeconds: -0.2,
                  levelDb: -18,
                  pan: -0.3,
                  proximity: "close_mic",
                  duckMusic: true
                }
              ],
              editorial: {
                visualEditCues: [
                  {
                    id: "cut-1",
                    type: "cut_to_black",
                    placement: "beat_end",
                    offsetSeconds: -0.15,
                    durationSeconds: 0.5,
                    target: "black",
                    intensity: 0.9
                  }
                ],
                silenceWindows: [
                  {
                    id: "sil-1",
                    placement: "beat_end",
                    offsetSeconds: -0.6,
                    durationSeconds: 0.4,
                    muteMusic: true,
                    muteSfx: true,
                    keepVoice: false
                  }
                ],
                endingPolicy: {
                  cutToBlack: true,
                  holdSeconds: 1,
                  audioPolicy: "hard_silence",
                  avoidOutro: true
                }
              }
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
          durationSeconds: 3,
          status: "generated",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    });

    const { timeline } = await syncProject(projectId, root);
    const [segment] = timeline.segments;
    assert.equal(segment.audioCues.length, 1);
    assert.equal(segment.visualEditCues.length, 1);
    assert.equal(segment.silenceWindows.length, 1);
    assert.equal(segment.endingPolicy?.cutToBlack, true);

    const [cue] = segment.audioCues;
    assert.equal(cue.pan, -0.3);
    assert.equal(cue.proximity, "close_mic");
    assert.equal(cue.duckMusic, true);
    assert.equal(cue.startSeconds, 2.8);

    const [editCue] = segment.visualEditCues;
    assert.equal(editCue.startSeconds, 2.85);
    assert.equal(editCue.target, "black");

    const [silenceWindow] = segment.silenceWindows;
    assert.equal(silenceWindow.startSeconds, 2.4);
    assert.equal(silenceWindow.endSeconds, 2.8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("syncProject reuses nearest section visual when balanced coverage leaves a beat without its own image", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-sync-balanced-visuals-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await mkdir(path.join(projectDir, "assets", "images", "generated"), { recursive: true });
    await writeFile(path.join(projectDir, "assets", "images", "generated", "intro-001.png"), "stub", "utf8");
    await writeFile(path.join(projectDir, "assets", "images", "generated", "intro-003.png"), "stub", "utf8");

    const beat = (id, order) => ({
      id,
      order,
      narration: `Beat ${order}.`,
      timing: { mediaPolicy: "loop_or_freeze", locked: false, estimatedDurationSeconds: 2 },
      media: [{ id: `${id}-visual`, type: "title_card", role: "primary_visual", prompt: `visual ${order}`, scaleMode: "cover", placement: "background" }],
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
      sfxCues: []
    });

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
          beats: [beat("intro-001", 1), beat("intro-002", 2), beat("intro-003", 3)]
        }
      ]
    });

    await writeJson(path.join(projectDir, "asset-manifest.json"), {
      schemaVersion: 1,
      assets: [
        {
          id: "image-intro-001",
          type: "image",
          role: "primary_visual",
          sectionId: "intro",
          beatId: "intro-001",
          path: "assets/images/generated/intro-001.png",
          source: { kind: "generated", provider: "openai-image", inputHash: "a" },
          status: "generated",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "image-intro-003",
          type: "image",
          role: "primary_visual",
          sectionId: "intro",
          beatId: "intro-003",
          path: "assets/images/generated/intro-003.png",
          source: { kind: "generated", provider: "openai-image", inputHash: "b" },
          status: "generated",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    });

    const { timeline } = await syncProject(projectId, root);
    assert.deepEqual(timeline.segments.map((segment) => segment.mediaAssetIds[0]), [
      "image-intro-001",
      "image-intro-003",
      "image-intro-003"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
