import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { reviewProject } from "../dist/review-project.js";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-review-test-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  const runStateDir = path.join(root, ".studio-data", "run-state");
  const generatedAt = "2026-05-19T00:00:00.000Z";

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
            id: "s1-001",
            order: 1,
            narration: "Short line.",
            voiceDirection: {
              profile: "neutral",
              emphasis: [],
              intensity: 0.5,
              pauseBeforeMs: 240,
              source: "llm",
            },
            timing: {
              preferredMinSeconds: 4,
              preferredMaxSeconds: 6,
              mediaPolicy: "loop_or_freeze",
              locked: false,
            },
            media: [],
            motion: { type: "none", intensity: 0 },
            caption: { emphasis: [], style: "default" },
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
        id: "voice-s1-001",
        type: "audio",
        role: "voiceover",
        sectionId: "s1",
        beatId: "s1-001",
        path: "assets/audio/voice/s1-001.wav",
        source: { kind: "generated", provider: "chatterbox", inputHash: "abc" },
        durationSeconds: 7.2,
        status: "stale",
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
    ],
  });

  await writeJson(path.join(projectDir, "timeline.json"), {
    schemaVersion: 1,
    generatedAt,
    sourcePlanHash: "plan-hash",
    fps: 30,
    width: 1080,
    height: 1920,
    durationSeconds: 7.2,
    segments: [
      {
        sectionId: "s1",
        beatId: "s1-001",
        startSeconds: 0,
        endSeconds: 7.2,
        durationSeconds: 7.2,
        mediaAssetIds: [],
        audioCues: [],
        renderPolicy: { mediaPolicy: "loop_or_freeze", scaleMode: "cover" },
      },
    ],
  });

  await writeJson(path.join(projectDir, "captions", "captions.json"), {
    schemaVersion: 1,
    status: "generated",
    source: { transcriptionProvider: "mock", audioAssetIds: ["voice-s1-001"] },
    captions: [
      {
        id: "c1",
        beatId: "s1-001",
        startSeconds: 0,
        endSeconds: 1.1,
        text: "No.",
        style: "default",
        words: [],
      },
      {
        id: "c2",
        beatId: "s1-001",
        startSeconds: 1.1,
        endSeconds: 3.4,
        text: "This is a deliberately long caption line that exceeds vertical readability limits by design.",
        style: "default",
        words: [],
      },
    ],
  });

  await writeJson(path.join(runStateDir, `${projectId}.json`), {
    status: "idle",
    lastRenderPlanHash: "different-plan-hash",
    lastRenderTimelineHash: "different-timeline-hash",
  });

  return { root, projectId };
}

test("reviewProject reports deterministic issues from isolated fixture", async () => {
  const { root, projectId } = await createFixtureRoot();
  try {
    const result = await reviewProject(projectId, root);
    assert.equal(result.projectId, projectId);
    assert.ok(Array.isArray(result.issues));
    assert.ok(result.issues.some((issue) => issue.code === "missing_primary_visual"));
    assert.ok(result.issues.some((issue) => issue.code === "missing_audio_processing_metadata"));
    assert.ok(result.issues.some((issue) => issue.code === "duration_above_preferred_max"));
    assert.ok(result.issues.some((issue) => issue.code === "caption_fragment_too_short"));
    assert.ok(result.issues.some((issue) => issue.code === "caption_line_too_long"));
    assert.ok(result.issues.some((issue) => issue.code === "asset_stale"));
    assert.ok(result.issues.some((issue) => issue.code === "render_stale"));
    assert.ok(result.issues.some((issue) => issue.code === "legacy_beat_fields_present"));
    assert.equal(result.summary.critical, 1);
    assert.ok(result.summary.warning >= 5);
    assert.ok(typeof result.summary.suggestion === "number");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reviewProject accepts balanced coverage when timeline reuses a renderable visual", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-review-balanced-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  const generatedAt = "2026-05-19T00:00:00.000Z";
  try {
    await mkdir(path.join(projectDir, "assets", "images", "generated"), { recursive: true });
    await writeFile(
      path.join(projectDir, "assets", "images", "generated", "intro-001.png"),
      "stub",
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
        tts: "chatterbox",
        transcription: "mock",
        media: "manual-media",
        renderer: "remotion",
      },
      voice: { provider: "chatterbox", voiceId: "clone", format: "wav", options: {} },
      sections: [
        {
          id: "s1",
          title: "Section 1",
          beats: [
            {
              id: "s1-001",
              order: 1,
              narration: "First beat.",
              timing: { mediaPolicy: "loop_or_freeze", locked: false },
              media: [],
              motion: { type: "none", intensity: 0 },
              caption: { emphasis: [], style: "default" },
              sfxCues: [],
            },
            {
              id: "s1-002",
              order: 2,
              narration: "Second beat.",
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
    await writeJson(path.join(projectDir, "asset-manifest.json"), {
      schemaVersion: 1,
      assets: [
        {
          id: "image-s1-001",
          type: "image",
          role: "primary_visual",
          sectionId: "s1",
          beatId: "s1-001",
          path: "assets/images/generated/intro-001.png",
          source: { kind: "generated", provider: "openai-image", inputHash: "a" },
          status: "generated",
          createdAt: generatedAt,
          updatedAt: generatedAt,
        },
      ],
    });
    await writeJson(path.join(projectDir, "timeline.json"), {
      schemaVersion: 1,
      generatedAt,
      sourcePlanHash: "plan-hash",
      fps: 30,
      width: 1080,
      height: 1920,
      durationSeconds: 4,
      segments: [
        {
          sectionId: "s1",
          beatId: "s1-001",
          startSeconds: 0,
          endSeconds: 2,
          durationSeconds: 2,
          mediaAssetIds: ["image-s1-001"],
          audioCues: [],
          renderPolicy: { mediaPolicy: "loop_or_freeze", scaleMode: "cover" },
        },
        {
          sectionId: "s1",
          beatId: "s1-002",
          startSeconds: 2,
          endSeconds: 4,
          durationSeconds: 2,
          mediaAssetIds: ["image-s1-001"],
          audioCues: [],
          renderPolicy: { mediaPolicy: "loop_or_freeze", scaleMode: "cover" },
        },
      ],
    });

    const result = await reviewProject(projectId, root);
    assert.equal(
      result.issues.some((issue) => issue.code === "missing_primary_visual"),
      false,
    );
    assert.equal(
      result.issues.some((issue) => issue.code === "missing_visual_file"),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
