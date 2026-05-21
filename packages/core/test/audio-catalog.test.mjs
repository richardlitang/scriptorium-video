import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { enrichAudioCatalog, ingestAudioToCatalog } from "../dist/audio-catalog.js";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("ingestAudioToCatalog stores licensed audio metadata and sha256", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-audio-catalog-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    const sourceFile = path.join(root, "source.wav");
    await writeFile(sourceFile, "audio-stub", "utf8");
    await mkdir(projectDir, { recursive: true });
    await writeJson(path.join(projectDir, "asset-manifest.json"), { schemaVersion: 1, assets: [] });

    const result = await ingestAudioToCatalog(projectId, sourceFile, {
      role: "music",
      assetId: "music-tense-001",
      provider: "epidemic_sound",
      licenseType: "creator_subscription",
      allowedPlatforms: ["youtube", "local_only"]
    }, root);

    assert.equal(result.assetId, "music-tense-001");
    const manifest = JSON.parse(await readFile(path.join(projectDir, "asset-manifest.json"), "utf8"));
    const asset = manifest.assets.find((entry) => entry.id === "music-tense-001");
    assert.ok(asset);
    assert.equal(asset.role, "music");
    assert.equal(asset.source.license.source, "epidemic_sound");
    assert.equal(asset.source.license.licenseType, "creator_subscription");
    assert.equal(Array.isArray(asset.source.license.allowedPlatforms), true);
    assert.ok(asset.source.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("enrichAudioCatalog backfills missing license and sha256 metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-audio-enrich-"));
  const projectId = "fixture";
  const projectDir = path.join(root, "content", "projects", projectId);
  try {
    await mkdir(path.join(projectDir, "assets", "audio", "sfx"), { recursive: true });
    await writeFile(path.join(projectDir, "assets", "audio", "sfx", "hit.wav"), "audio-stub", "utf8");
    await writeJson(path.join(projectDir, "asset-manifest.json"), {
      schemaVersion: 1,
      assets: [
        {
          id: "sfx-hit",
          type: "audio",
          role: "sfx",
          path: "assets/audio/sfx/hit.wav",
          source: { kind: "imported", provider: "youtube_audio_library" },
          status: "generated",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    });
    const result = await enrichAudioCatalog(projectId, { role: "sfx", licenseType: "youtube_audio_library_license" }, root);
    assert.equal(result.updated, 1);
    const manifest = JSON.parse(await readFile(path.join(projectDir, "asset-manifest.json"), "utf8"));
    const asset = manifest.assets[0];
    assert.ok(asset.source.sha256);
    assert.equal(asset.source.license.licenseType, "youtube_audio_library_license");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
