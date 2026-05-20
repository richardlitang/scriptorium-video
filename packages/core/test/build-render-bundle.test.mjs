import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildRenderBundle } from "../dist/render/build-render-bundle.js";
import { hashString } from "../dist/hash.js";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function planFixture() {
  return {
    schemaVersion: 1,
    title: "Fixture",
    mode: "short_story",
    targetPlatform: "local_only",
    stylePackId: "default",
    providers: { llm: "manual", tts: "chatterbox", transcription: "mock", media: "manual-media", renderer: "remotion" },
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
            sfxCues: []
          }
        ]
      }
    ]
  };
}

test("buildRenderBundle blocks rendering when a timeline segment has no visual", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-render-bundle-missing-visual-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  const generatedAt = "2026-05-19T00:00:00.000Z";
  const plan = planFixture();
  try {
    await writeJson(path.join(projectDir, "project.json"), {
      schemaVersion: 1,
      id: projectId,
      title: "Fixture",
      createdAt: generatedAt,
      updatedAt: generatedAt,
      status: "draft"
    });
    await writeJson(path.join(projectDir, "video-plan.json"), plan);
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });
    await writeJson(path.join(projectDir, "timeline.json"), {
      schemaVersion: 1,
      generatedAt,
      sourcePlanHash: hashString(`${JSON.stringify(plan, null, 2)}\n`),
      fps: 30,
      width: 1080,
      height: 1920,
      durationSeconds: 2,
      segments: [
        {
          sectionId: "s1",
          beatId: "s1-001",
          startSeconds: 0,
          endSeconds: 2,
          durationSeconds: 2,
          mediaAssetIds: [],
          audioCues: [],
          renderPolicy: { mediaPolicy: "loop_or_freeze", scaleMode: "cover" }
        }
      ]
    });

    await assert.rejects(
      () => buildRenderBundle({ projectId, rootDir: root }),
      /s1-001 has no visual asset/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
