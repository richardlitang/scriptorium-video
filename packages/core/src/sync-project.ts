import path from "node:path";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { AssetManifestSchema, type Asset } from "./schemas/asset-manifest.schema.js";
import { TimelineSchema, type Timeline } from "./schemas/timeline.schema.js";
import { resolveConfig } from "./config-resolver.js";
import { hashFile, hashString } from "./hash.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { probeMedia } from "./media-probe.js";
import { getProjectPaths } from "./paths.js";
import { normalizeVideoPlan, prepareVideoPlanForSchema } from "./normalize-video-plan.js";
import { resolveBeatProductionDirection } from "./resolve-production-direction.js";
import { VideoPlanSchema, type Beat } from "./schemas/video-plan.schema.js";
import {
  coreAutoMusicBedEnabled,
  coreDefaultMusicBed,
  coreMusicBedLevelDb,
  coreSfxLibraryDir,
} from "./core-runtime-env.js";

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

type CueMap = Record<string, string[]>;

function findVoiceAsset(assets: Asset[], beatId: string): Asset | undefined {
  return assets.find((asset) => asset.beatId === beatId && asset.role === "voiceover");
}

function isNonSpokenDirectiveOnly(text: string): boolean {
  const source = String(text ?? "").trim();
  if (!source) return false;
  const stripped = source
    .replace(
      /\[[^\]]*(?:background visual|sfx|cut to black|smash cut|low thud|slow pan|slow zoom)[^\]]*\]/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return !stripped && /\[[^\]]+\]/.test(source);
}

function beatOrderIndex(beats: Beat[], beatId: string): number {
  return beats.findIndex((beat) => beat.id === beatId);
}

function findMediaAssets(
  assets: Asset[],
  sectionId: string,
  beats: Beat[],
  beatId: string,
): Asset[] {
  const exact = assets.filter((asset) => asset.beatId === beatId && asset.role !== "voiceover");
  if (exact.length > 0) return exact;

  const targetIndex = beatOrderIndex(beats, beatId);
  if (targetIndex < 0) return [];
  const sectionVisuals = assets
    .filter(
      (asset) => asset.sectionId === sectionId && asset.role === "primary_visual" && asset.beatId,
    )
    .map((asset) => ({
      asset,
      index: beatOrderIndex(beats, asset.beatId ?? ""),
    }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => {
      const distance = Math.abs(a.index - targetIndex) - Math.abs(b.index - targetIndex);
      if (distance !== 0) return distance;
      return b.index - a.index;
    });

  return sectionVisuals[0] ? [sectionVisuals[0].asset] : [];
}

function resolveCueAsset(
  assets: Asset[],
  beatId: string,
  cueId: string,
  assetId?: string,
): Asset | undefined {
  if (assetId) {
    return assets.find(
      (asset) => asset.id === assetId && (asset.role === "sfx" || asset.role === "music"),
    );
  }
  return assets.find(
    (asset) =>
      (asset.role === "sfx" || asset.role === "music") &&
      (asset.id === cueId || asset.beatId === beatId),
  );
}

function resolveCueAssetFromMap(
  cueMap: CueMap,
  assets: Asset[],
  beatId: string,
  cueId: string,
  cueKind: string,
): Asset | undefined {
  const keys = [cueMapKey(cueId), cueMapKey(cueKind), cueMapKey(cueSlug(cueKind))].filter(Boolean);
  for (const key of keys) {
    const candidates = cueMap[key] ?? [];
    const assetsForCue = candidates
      .map((assetId) =>
        assets.find(
          (asset) => asset.id === assetId && (asset.role === "sfx" || asset.role === "music"),
        ),
      )
      .filter((asset) => Boolean(asset)) as Asset[];
    const selected = pickDeterministic(assetsForCue, `${beatId}:${cueId}:${cueKind}:${key}`);
    if (selected) return selected;
  }
  return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cueSlug(kind: string): string {
  return (
    String(kind || "cue")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "cue"
  );
}

function cueMapKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickDeterministic<T>(items: T[], seed: string): T | undefined {
  if (items.length === 0) return undefined;
  const digest = hashString(seed).slice(0, 8);
  const index = Number.parseInt(digest, 16) % items.length;
  return items[index];
}

async function loadCueMap(rootDir: string): Promise<CueMap> {
  const filePath = path.resolve(rootDir, "content", "audio", "cue-map.json");
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed).filter(([, value]) => Array.isArray(value));
    return Object.fromEntries(
      entries.map(([key, value]) => [
        cueMapKey(key),
        (value as unknown[]).map((entry) => String(entry)),
      ]),
    );
  } catch {
    return {};
  }
}

async function resolveCueAssetFromLibrary(
  projectId: string,
  rootDir: string,
  projectDir: string,
  kind: string,
  assets: Asset[],
): Promise<Asset | undefined> {
  const slug = cueSlug(kind);
  const existing = assets.find(
    (asset) => (asset.role === "sfx" || asset.role === "music") && asset.id === `sfx-lib-${slug}`,
  );
  if (existing) return existing;
  const sfxLibraryDir = coreSfxLibraryDir();

  const candidates = [
    path.join(rootDir, "content", "sfx", `${slug}.wav`),
    path.join(rootDir, "content", "sfx", `${slug}.mp3`),
    path.join(rootDir, "content", "sfx", `${slug}.m4a`),
    sfxLibraryDir ? path.join(sfxLibraryDir, `${slug}.wav`) : "",
    sfxLibraryDir ? path.join(sfxLibraryDir, `${slug}.mp3`) : "",
    sfxLibraryDir ? path.join(sfxLibraryDir, `${slug}.m4a`) : "",
  ].filter(Boolean);

  const sourcePath = await (async () => {
    for (const candidate of candidates) {
      if (await fileExists(candidate)) return candidate;
    }
    return undefined;
  })();
  if (!sourcePath) return undefined;

  const ext = path.extname(sourcePath).toLowerCase() || ".wav";
  const relativePath = path.join("assets", "audio", "sfx", "library", `${slug}${ext}`);
  const absolutePath = path.resolve(projectDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  if (!(await fileExists(absolutePath))) {
    await copyFile(sourcePath, absolutePath);
  }
  const created: Asset = {
    id: `sfx-lib-${slug}`,
    type: "audio",
    role: "sfx",
    path: relativePath,
    source: {
      kind: "manual",
      provider: "sfx-library",
      sha256: await hashFile(absolutePath),
      license: {
        source: "local_library",
        licenseType: "internal_catalog",
        attributionRequired: false,
        allowedPlatforms: ["youtube", "local_only"],
        downloadedAt: new Date().toISOString(),
      },
    },
    durationSeconds: 0,
    status: "generated",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assets.push(created);
  return created;
}

function resolveEnvMusicPath(rootDir: string, envPath: string): string {
  return path.isAbsolute(envPath) ? envPath : path.resolve(rootDir, envPath);
}

async function resolveDefaultMusicBedAsset(
  rootDir: string,
  projectDir: string,
  assets: Asset[],
): Promise<Asset | undefined> {
  const existing = assets.find(
    (asset) => asset.id === "music-bed-default" && asset.role === "music",
  );
  if (existing) return existing;

  const envPath = coreDefaultMusicBed();
  const candidates = [
    envPath ? resolveEnvMusicPath(rootDir, envPath) : "",
    path.join(rootDir, "content", "music", "default.wav"),
    path.join(rootDir, "content", "music", "default.mp3"),
    path.join(rootDir, "content", "music", "default.m4a"),
  ].filter(Boolean);

  const sourcePath = await (async () => {
    for (const candidate of candidates) {
      if (await fileExists(candidate)) return candidate;
    }
    return undefined;
  })();
  if (!sourcePath) return undefined;

  const ext = path.extname(sourcePath).toLowerCase() || ".wav";
  const relativePath = path.join("assets", "audio", "music", "library", `default${ext}`);
  const absolutePath = path.resolve(projectDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  if (!(await fileExists(absolutePath))) {
    await copyFile(sourcePath, absolutePath);
  }
  const created: Asset = {
    id: "music-bed-default",
    type: "audio",
    role: "music",
    path: relativePath,
    source: {
      kind: "manual",
      provider: "music-library",
      sha256: await hashFile(absolutePath),
      license: {
        source: "local_library",
        licenseType: "internal_catalog",
        attributionRequired: false,
        allowedPlatforms: ["youtube", "local_only"],
        downloadedAt: new Date().toISOString(),
      },
    },
    durationSeconds: 0,
    status: "generated",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assets.push(created);
  return created;
}

function durationForBeat(beat: Beat, voiceAsset: Asset | undefined, mediaAssets: Asset[]): number {
  if (beat.timing.mediaPolicy === "fit_audio_to_media") {
    const mediaDuration = mediaAssets.find((asset) => asset.durationSeconds)?.durationSeconds;
    if (mediaDuration && mediaDuration > 0) return mediaDuration;
  }
  if (voiceAsset?.durationSeconds && voiceAsset.durationSeconds > 0)
    return voiceAsset.durationSeconds;
  if (beat.timing.estimatedDurationSeconds) return beat.timing.estimatedDurationSeconds;
  return 3;
}

function differs(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) > EPSILON;
}

function cueStartForPlacement(
  placement: string,
  segmentStart: number,
  segmentEnd: number,
  offsetSeconds: number,
): number {
  if (placement === "beat_end") return Math.max(0, segmentEnd + offsetSeconds);
  return Math.max(0, segmentStart + offsetSeconds);
}

function assertLicensedAudioAsset(asset: Asset): void {
  const license = asset.source?.license;
  const sha256 = asset.source?.sha256;
  if (
    !license ||
    !license.source ||
    !license.licenseType ||
    !license.downloadedAt ||
    !Array.isArray(license.allowedPlatforms) ||
    license.allowedPlatforms.length === 0 ||
    !sha256
  ) {
    throw new Error(
      `Audio asset ${asset.id} (${asset.role}) is missing required licensing metadata. Use 'lvstudio audio:ingest' before sync/render.`,
    );
  }
}

export async function syncProject(projectId: string, rootDir = process.cwd()): Promise<SyncResult> {
  const paths = getProjectPaths(projectId, rootDir);
  const rawPlan = JSON.parse(await readFile(paths.videoPlan, "utf8")) as unknown;
  const plan = normalizeVideoPlan(VideoPlanSchema.parse(prepareVideoPlanForSchema(rawPlan)));
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
          message: "Asset is locked_by_user; probe metadata used only for timeline computation.",
        });
      }

      try {
        const probed = await probeMedia(path.resolve(paths.projectDir, asset.path));
        const nextAsset: Asset = {
          ...asset,
          durationSeconds: probed.durationSeconds ?? asset.durationSeconds,
          width: probed.width ?? asset.width,
          height: probed.height ?? asset.height,
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
              "Asset metadata changed from persisted values. Marked as stale for manual review.",
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
          message: `Unable to probe media file: ${asset.path}`,
        });
        return asset;
      }
    }),
  );

  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse({ ...manifest, assets }));

  const shouldAutoMusicBed =
    resolvedConfig.musicBehavior === "continuous_ducked" ||
    resolvedConfig.musicBehavior === "section_based_ducked";
  const autoMusicBed =
    shouldAutoMusicBed && coreAutoMusicBedEnabled()
      ? await resolveDefaultMusicBedAsset(rootDir, paths.projectDir, assets)
      : undefined;
  const autoMusicLevelDb = coreMusicBedLevelDb();
  const cueMap = await loadCueMap(rootDir);

  let cursor = 0;
  const segments = [];
  for (const section of plan.sections) {
    const orderedBeats = section.beats.sort((a, b) => a.order - b.order);
    for (const beat of orderedBeats) {
      if (isNonSpokenDirectiveOnly(beat.narration)) {
        issues.push({
          level: "info",
          beatId: beat.id,
          message: "Skipped non-spoken directive-only beat.",
        });
        continue;
      }
      const resolvedDirection = resolveBeatProductionDirection(plan, section, beat);
      const voiceAsset = findVoiceAsset(assets, beat.id);
      const mediaAssets = findMediaAssets(assets, section.id, orderedBeats, beat.id);
      const durationSeconds = durationForBeat(beat, voiceAsset, mediaAssets);
      const segmentStart = cursor;
      const segmentEnd = cursor + durationSeconds;
      const audioCues = [];
      for (const cue of resolvedDirection.sfxCues ?? []) {
        let cueAsset = resolveCueAsset(assets, beat.id, cue.id, cue.assetId);
        if (!cueAsset && cue.kind) {
          cueAsset = resolveCueAssetFromMap(cueMap, assets, beat.id, cue.id, cue.kind);
        }
        if (!cueAsset && cue.kind) {
          cueAsset = await resolveCueAssetFromLibrary(
            projectId,
            rootDir,
            paths.projectDir,
            cue.kind,
            assets,
          );
        }
        if (!cueAsset) {
          issues.push({
            level: "warning",
            beatId: beat.id,
            message: `Cue asset not found for ${cue.id}.`,
          });
          continue;
        }
        assertLicensedAudioAsset(cueAsset);
        const rawStart = cueStartForPlacement(
          cue.placement,
          segmentStart,
          segmentEnd,
          cue.offsetSeconds,
        );
        const startSeconds = Math.max(0, rawStart);
        audioCues.push({
          assetId: cueAsset.id,
          role: cueAsset.role === "music" ? "music" : "sfx",
          startSeconds,
          durationSeconds: cueAsset.durationSeconds ?? 0,
          levelDb: cue.levelDb,
          pan: cue.pan ?? 0,
          proximity: cue.proximity ?? "room",
          duckMusic: cue.duckMusic ?? false,
        });
      }
      const visualEditCues = (resolvedDirection.editorial?.visualEditCues ?? []).map((cue) => {
        const startSeconds = cueStartForPlacement(
          cue.placement,
          segmentStart,
          segmentEnd,
          cue.offsetSeconds,
        );
        return {
          id: cue.id,
          type: cue.type,
          startSeconds,
          durationSeconds: cue.durationSeconds,
          target: cue.target,
          intensity: cue.intensity,
        };
      });
      const silenceWindows = (resolvedDirection.editorial?.silenceWindows ?? []).map((window) => {
        const startSeconds = cueStartForPlacement(
          window.placement,
          segmentStart,
          segmentEnd,
          window.offsetSeconds,
        );
        const endSeconds = startSeconds + window.durationSeconds;
        return {
          id: window.id,
          startSeconds,
          endSeconds,
          muteMusic: window.muteMusic,
          muteSfx: window.muteSfx,
          keepVoice: window.keepVoice,
        };
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
        visualEditCues,
        silenceWindows,
        endingPolicy: resolvedDirection.editorial?.endingPolicy,
        renderPolicy: {
          mediaPolicy: beat.timing.mediaPolicy,
          scaleMode: beat.media[0]?.scaleMode ?? "cover",
        },
      };
      if (autoMusicBed && !segment.audioCues.some((cue) => cue.role === "music")) {
        assertLicensedAudioAsset(autoMusicBed);
        segment.audioCues.push({
          assetId: autoMusicBed.id,
          role: "music",
          startSeconds: segmentStart,
          durationSeconds,
          levelDb: Number.isFinite(autoMusicLevelDb) ? autoMusicLevelDb : -24,
          pan: 0,
          proximity: "room",
          duckMusic: false,
        });
      }
      cursor = segmentEnd;
      segments.push(segment);
    }
  }

  const timeline = TimelineSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourcePlanHash: await hashFile(paths.videoPlan),
    fps: resolvedConfig.fps,
    width: resolvedConfig.resolution.width,
    height: resolvedConfig.resolution.height,
    durationSeconds: cursor,
    segments,
    audioLayers: segments.flatMap((segment) => {
      const layers = [];
      if (segment.voiceAssetId) {
        layers.push({
          type: "narration",
          assetId: segment.voiceAssetId,
          startSeconds: segment.startSeconds,
          durationSeconds: segment.durationSeconds,
          gainDb: 0,
          duckUnderNarration: false,
        });
      }
      for (const cue of segment.audioCues) {
        layers.push({
          type: cue.role === "music" ? "music" : "sfx",
          assetId: cue.assetId,
          startSeconds: cue.startSeconds,
          durationSeconds: cue.durationSeconds,
          gainDb: cue.levelDb,
          duckUnderNarration: cue.role === "music",
        });
      }
      return layers;
    }),
  });

  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse({ ...manifest, assets }));
  await writeJsonFile(paths.timeline, timeline);
  return {
    timeline,
    issues,
    staleAssetIds: [...staleAssetIds],
  };
}
