import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { AssetManifestSchema } from "./schemas/asset-manifest.schema.js";
import { getProjectPaths } from "./paths.js";
import { probeMedia, type ProbeResult } from "./media-probe.js";
import { readJsonFile, writeJsonFile } from "./json.js";

export type ImportMediaOptions = {
  beat: string;
  role: "primary_visual" | "broll" | "screen" | "overlay";
  section?: string;
  copy?: boolean;
};

function mediaTypeFromPath(filePath: string): "image" | "video" {
  const ext = path.extname(filePath).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".mkv"].includes(ext)) return "video";
  return "image";
}

export async function importMediaToProject(
  projectId: string,
  filePath: string,
  options: ImportMediaOptions,
): Promise<{ assetId: string; relativePath: string }> {
  const paths = getProjectPaths(projectId);
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const type = mediaTypeFromPath(filePath);
  const sourceAbsolute = path.resolve(filePath);
  const assetsDir =
    type === "video"
      ? path.join(paths.projectDir, "assets", "video")
      : path.join(paths.projectDir, "assets", "images");
  await mkdir(assetsDir, { recursive: true });

  const fileName = path.basename(sourceAbsolute);
  const targetAbsolute = path.join(assetsDir, fileName);
  if (options.copy !== false) {
    await copyFile(sourceAbsolute, targetAbsolute);
  }

  const relativePath = path.relative(paths.projectDir, targetAbsolute);
  const probed: ProbeResult = await probeMedia(targetAbsolute).catch(() => ({}));
  const now = new Date().toISOString();
  const id = `media-${options.beat}-${Date.now()}`;

  manifest.assets.push({
    id,
    type: type === "video" ? "video" : "image",
    role: options.role,
    sectionId: options.section,
    beatId: options.beat,
    path: relativePath,
    source: {
      kind: "imported",
      originalPath: sourceAbsolute,
    },
    durationSeconds: probed.durationSeconds,
    width: probed.width,
    height: probed.height,
    status: "generated",
    createdAt: now,
    updatedAt: now,
  });

  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
  return { assetId: id, relativePath };
}
