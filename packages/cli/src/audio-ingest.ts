import { enrichAudioCatalog, ingestAudioToCatalog } from "@lvstudio/core";

export type AudioIngestCliOptions = {
  role: "music" | "sfx";
  assetId?: string;
  provider: string;
  licenseType: string;
  sourceUrl?: string;
  creator?: string;
  trackId?: string;
  attributionRequired?: boolean;
  allowedPlatforms?: string;
  downloadedAt?: string;
};

export async function ingestAudioCli(
  projectId: string,
  filePath: string,
  options: AudioIngestCliOptions,
): Promise<void> {
  const platforms = String(options.allowedPlatforms || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const result = await ingestAudioToCatalog(projectId, filePath, {
    role: options.role,
    assetId: options.assetId,
    provider: options.provider,
    licenseType: options.licenseType,
    sourceUrl: options.sourceUrl,
    creator: options.creator,
    trackId: options.trackId,
    attributionRequired: options.attributionRequired === true,
    allowedPlatforms: platforms,
    downloadedAt: options.downloadedAt,
  });
  console.log(`Ingested ${result.assetId} -> ${result.path}`);
}

export async function enrichAudioCli(
  projectId: string,
  options: {
    role?: "music" | "sfx";
    provider?: string;
    licenseType?: string;
    allowedPlatforms?: string;
  },
): Promise<void> {
  const platforms = String(options.allowedPlatforms || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const result = await enrichAudioCatalog(projectId, {
    role: options.role,
    provider: options.provider,
    licenseType: options.licenseType,
    allowedPlatforms: platforms,
  });
  console.log(`Enriched audio catalog: updated ${result.updated}, skipped ${result.skipped}.`);
}
