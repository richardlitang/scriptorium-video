import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { AssetManifestSchema, type Asset } from "./schemas/asset-manifest.schema.js";
import { hashFile } from "./hash.js";
import { probeMedia, type ProbeResult } from "./media-probe.js";
import { getProjectPaths } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json.js";

export type IngestAudioOptions = {
  role: "music" | "sfx";
  assetId?: string;
  provider: string;
  licenseType: string;
  sourceUrl?: string;
  creator?: string;
  trackId?: string;
  attributionRequired?: boolean;
  allowedPlatforms?: string[];
  downloadedAt?: string;
};

export type EnrichAudioCatalogOptions = {
  role?: "music" | "sfx";
  provider?: string;
  licenseType?: string;
  allowedPlatforms?: string[];
};

function slugify(value: string): string {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "audio"
  );
}

function inferAudioExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3" || ext === ".m4a" || ext === ".wav") return ext;
  return ".wav";
}

export async function ingestAudioToCatalog(
  projectId: string,
  sourceFilePath: string,
  options: IngestAudioOptions,
  rootDir = process.cwd(),
): Promise<{ assetId: string; path: string }> {
  const paths = getProjectPaths(projectId, rootDir);
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const sourceAbsolute = path.resolve(sourceFilePath);
  const ext = inferAudioExt(sourceAbsolute);
  const baseName = slugify(path.basename(sourceAbsolute, path.extname(sourceAbsolute)));
  const assetId = options.assetId?.trim() || `${options.role}-${baseName}`;
  const roleDir = options.role === "music" ? "music" : "sfx";
  const relativePath = path.join("assets", "audio", roleDir, "catalog", `${assetId}${ext}`);
  const targetAbsolute = path.resolve(paths.projectDir, relativePath);
  await mkdir(path.dirname(targetAbsolute), { recursive: true });
  await copyFile(sourceAbsolute, targetAbsolute);

  const probed: ProbeResult = await probeMedia(targetAbsolute).catch(() => ({}));
  const sha256 = await hashFile(targetAbsolute);
  const now = new Date().toISOString();
  const downloadedAt = options.downloadedAt || now;
  const allowedPlatforms =
    options.allowedPlatforms && options.allowedPlatforms.length > 0
      ? options.allowedPlatforms
      : ["youtube"];
  const nextAsset: Asset = {
    id: assetId,
    type: "audio",
    role: options.role,
    path: relativePath,
    source: {
      kind: "imported",
      provider: options.provider,
      originalPath: sourceAbsolute,
      sha256,
      license: {
        source: options.provider,
        licenseType: options.licenseType,
        attributionRequired: options.attributionRequired === true,
        allowedPlatforms,
        sourceUrl: options.sourceUrl,
        creator: options.creator,
        trackId: options.trackId,
        downloadedAt,
      },
    },
    durationSeconds: probed.durationSeconds,
    status: "generated",
    createdAt: now,
    updatedAt: now,
  };

  manifest.assets = manifest.assets.filter((asset) => asset.id !== assetId);
  manifest.assets.push(nextAsset);
  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
  return { assetId, path: relativePath };
}

export async function enrichAudioCatalog(
  projectId: string,
  options: EnrichAudioCatalogOptions = {},
  rootDir = process.cwd(),
): Promise<{ updated: number; skipped: number }> {
  const paths = getProjectPaths(projectId, rootDir);
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const allowedPlatforms =
    options.allowedPlatforms && options.allowedPlatforms.length > 0
      ? options.allowedPlatforms
      : ["youtube"];

  for (const asset of manifest.assets) {
    if (asset.type !== "audio") {
      skipped += 1;
      continue;
    }
    if (options.role && asset.role !== options.role) {
      skipped += 1;
      continue;
    }
    const absolutePath = path.resolve(paths.projectDir, asset.path);
    const probed = await probeMedia(absolutePath).catch((): Partial<ProbeResult> => ({}));
    const sha256 = await hashFile(absolutePath).catch(() => undefined);
    if (probed.durationSeconds !== undefined) asset.durationSeconds = probed.durationSeconds;
    if (sha256) asset.source.sha256 = sha256;
    if (!asset.source.license) {
      asset.source.license = {
        source: options.provider || asset.source.provider || "unknown",
        licenseType: options.licenseType || "unknown",
        attributionRequired: false,
        allowedPlatforms,
        downloadedAt: now,
      };
    } else {
      if (!asset.source.license.source)
        asset.source.license.source = options.provider || asset.source.provider || "unknown";
      if (!asset.source.license.licenseType)
        asset.source.license.licenseType = options.licenseType || "unknown";
      if (
        !asset.source.license.allowedPlatforms ||
        asset.source.license.allowedPlatforms.length === 0
      ) {
        asset.source.license.allowedPlatforms = allowedPlatforms;
      }
      if (!asset.source.license.downloadedAt) asset.source.license.downloadedAt = now;
    }
    asset.updatedAt = now;
    updated += 1;
  }
  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
  return { updated, skipped };
}
