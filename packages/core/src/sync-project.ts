import path from "node:path";
import { AssetManifestSchema, type Asset } from "./schemas/asset-manifest.schema.js";
import { TimelineSchema, type Timeline } from "./schemas/timeline.schema.js";
import { resolveConfig } from "./config-resolver.js";
import { hashFile } from "./hash.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { probeMedia } from "./media-probe.js";
import { getProjectPaths } from "./paths.js";
import { VideoPlanSchema, type Beat } from "./schemas/video-plan.schema.js";

const EPSILON = 0.001;

export type SyncIssue = {
  level: "info" | "warning";
  assetId?: string;
  beatId?: string;
  message: string;
};

export type SyncResult = {
  timeline: Timeline;
  issues: SyncIssue[];
  staleAssetIds: string[];
};

function findVoiceAsset(assets: Asset[], beatId: string): Asset | undefined {
  return assets.find((asset) => asset.beatId === beatId && asset.role === "voiceover");
}

function findMediaAssets(assets: Asset[], beatId: string): Asset[] {
  return assets.filter((asset) => asset.beatId === beatId && asset.role !== "voiceover");
}

function resolveCueAsset(assets: Asset[], beatId: string, cueId: string, assetId?: string): Asset | undefined {
  if (assetId) {
    return assets.find((asset) => asset.id === assetId && (asset.role === "sfx" || asset.role === "music"));
  }
  return assets.find(
    (asset) =>
      (asset.role === "sfx" || asset.role === "music") &&
      (asset.id === cueId || asset.beatId === beatId)
  );
}

function durationForBeat(beat: Beat, voiceAsset: Asset | undefined, mediaAssets: Asset[]): number {
  if (beat.timing.mediaPolicy === "fit_audio_to_media") {
    const mediaDuration = mediaAssets.find((asset) => asset.durationSeconds)?.durationSeconds;
    if (mediaDuration && mediaDuration > 0) return mediaDuration;
  }
  if (voiceAsset?.durationSeconds && voiceAsset.durationSeconds > 0) return voiceAsset.durationSeconds;
  if (beat.timing.estimatedDurationSeconds) return beat.timing.estimatedDurationSeconds;
  return 3;
}

function differs(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) > EPSILON;
}

export async function syncProject(projectId: string, rootDir = process.cwd()): Promise<SyncResult> {
  const paths = getProjectPaths(projectId, rootDir);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const resolvedConfig = await resolveConfig(plan, rootDir);
  const issues: SyncIssue[] = [];
  const staleAssetIds = new Set<string>();

  const assets = await Promise.all(
    manifest.assets.map(async (asset) => {
      if (asset.status === "locked_by_user") {
        issues.push({
          level: "info",
          assetId: asset.id,
          beatId: asset.beatId,
          message: "Asset is locked_by_user; probe metadata used only for timeline computation."
        });
      }

      try {
        const probed = await probeMedia(path.resolve(paths.projectDir, asset.path));
        const nextAsset: Asset = {
          ...asset,
          durationSeconds: probed.durationSeconds ?? asset.durationSeconds,
          width: probed.width ?? asset.width,
          height: probed.height ?? asset.height
        };
        const becameStale =
          differs(asset.durationSeconds, probed.durationSeconds) ||
          differs(asset.width, probed.width) ||
          differs(asset.height, probed.height);
        if (becameStale) {
          staleAssetIds.add(asset.id);
          issues.push({
            level: "warning",
            assetId: asset.id,
            beatId: asset.beatId,
            message:
              "Asset metadata changed from persisted values. Marked as stale for manual review."
          });
          nextAsset.status = asset.status === "locked_by_user" ? "locked_by_user" : "stale";
        }
        nextAsset.updatedAt = new Date().toISOString();
        return nextAsset;
      } catch {
        issues.push({
          level: "warning",
          assetId: asset.id,
          beatId: asset.beatId,
          message: `Unable to probe media file: ${asset.path}`
        });
        return asset;
      }
    })
  );

  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse({ ...manifest, assets }));

  let cursor = 0;
  const segments = plan.sections.flatMap((section) =>
    section.beats
      .sort((a, b) => a.order - b.order)
      .map((beat) => {
        const voiceAsset = findVoiceAsset(assets, beat.id);
        const mediaAssets = findMediaAssets(assets, beat.id);
        const durationSeconds = durationForBeat(beat, voiceAsset, mediaAssets);
        const segmentStart = cursor;
        const segmentEnd = cursor + durationSeconds;
        const audioCues = (beat.sfxCues ?? []).flatMap((cue) => {
          const cueAsset = resolveCueAsset(assets, beat.id, cue.id, cue.assetId);
          if (!cueAsset) {
            issues.push({
              level: "warning",
              beatId: beat.id,
              message: `Cue asset not found for ${cue.id}.`
            });
            return [];
          }
          const rawStart =
            cue.placement === "beat_end"
              ? segmentEnd + cue.offsetSeconds
              : segmentStart + cue.offsetSeconds;
          const startSeconds = Math.max(0, rawStart);
          return [
            {
              assetId: cueAsset.id,
              role: cueAsset.role === "music" ? "music" : "sfx",
              startSeconds,
              durationSeconds: cueAsset.durationSeconds ?? 0,
              levelDb: cue.levelDb
            }
          ];
        });
        const segment = {
          sectionId: section.id,
          beatId: beat.id,
          startSeconds: segmentStart,
          endSeconds: segmentEnd,
          durationSeconds,
          voiceAssetId: voiceAsset?.id,
          mediaAssetIds: mediaAssets.map((asset) => asset.id),
          audioCues,
          renderPolicy: {
            mediaPolicy: beat.timing.mediaPolicy,
            scaleMode: beat.media[0]?.scaleMode ?? "cover"
          }
        };
        cursor = segmentEnd;
        return segment;
      })
  );

  const timeline = TimelineSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourcePlanHash: await hashFile(paths.videoPlan),
    fps: resolvedConfig.fps,
    width: resolvedConfig.resolution.width,
    height: resolvedConfig.resolution.height,
    durationSeconds: cursor,
    segments
  });

  await writeJsonFile(paths.timeline, timeline);
  return {
    timeline,
    issues,
    staleAssetIds: [...staleAssetIds]
  };
}
