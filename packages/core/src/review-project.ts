import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { readJsonFile } from "./json.js";
import { getProjectPaths } from "./paths.js";
import type { Asset } from "./schemas/asset-manifest.schema.js";
import { AssetManifestSchema } from "./schemas/asset-manifest.schema.js";
import { CaptionsFileSchema } from "./schemas/captions.schema.js";
import { TimelineSchema } from "./schemas/timeline.schema.js";
import { VideoPlanSchema } from "./schemas/video-plan.schema.js";
import { hashString } from "./hash.js";
import { normalizeVideoPlan } from "./normalize-video-plan.js";
import { findLegacyBeatFieldUsages } from "./plan-legacy-fields.js";

export type ReviewSeverity = "critical" | "warning" | "suggestion";
export type ReviewScope = "project" | "section" | "beat" | "asset" | "render";

export type ReviewIssue = {
  id: string;
  severity: ReviewSeverity;
  scope: ReviewScope;
  code: string;
  message: string;
  beatId?: string;
  sectionId?: string;
  assetId?: string;
};

export type ReviewResult = {
  projectId: string;
  generatedAt: string;
  summary: {
    critical: number;
    warning: number;
    suggestion: number;
  };
  issues: ReviewIssue[];
};

function makeIssue(issue: Omit<ReviewIssue, "id">): ReviewIssue {
  return { ...issue, id: hashString(JSON.stringify(issue)).slice(0, 12) };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isVisualAsset(asset: Asset | undefined): asset is Asset {
  return Boolean(
    asset &&
    ["image", "video", "screen_recording"].includes(asset.type) &&
    asset.role !== "voiceover",
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function reviewProject(
  projectId: string,
  rootDir = process.cwd(),
): Promise<ReviewResult> {
  const paths = getProjectPaths(projectId, rootDir);
  const [rawPlan, manifest] = await Promise.all([
    normalizeVideoPlan(await readJsonFile(paths.videoPlan, VideoPlanSchema)),
    readJsonFile(paths.assetManifest, AssetManifestSchema),
  ]);
  const plan = rawPlan;
  const timeline = await readJsonFile(paths.timeline, TimelineSchema).catch(() => undefined);
  const captions = await readJsonFile(paths.captions, CaptionsFileSchema).catch(() => undefined);
  const issues: ReviewIssue[] = [];

  const timelineByBeat = new Map(
    (timeline?.segments ?? []).map((segment) => [segment.beatId, segment]),
  );
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const captionsByBeat = new Map<string, Array<{ text: string }>>();
  for (const caption of captions?.captions ?? []) {
    if (!caption.beatId) continue;
    captionsByBeat.set(caption.beatId, [...(captionsByBeat.get(caption.beatId) ?? []), caption]);
  }

  for (const section of plan.sections) {
    for (const beat of section.beats) {
      const segment = timelineByBeat.get(beat.id);
      const visualAssetId = segment?.mediaAssetIds?.[0];
      const visual = visualAssetId
        ? assetsById.get(visualAssetId)
        : manifest.assets.find(
            (asset) => asset.beatId === beat.id && asset.role === "primary_visual",
          );
      const voice = manifest.assets.find(
        (asset) => asset.beatId === beat.id && asset.role === "voiceover",
      );
      if (!isVisualAsset(visual)) {
        issues.push(
          makeIssue({
            severity: "critical",
            scope: "beat",
            code: "missing_primary_visual",
            message: "Beat has no renderable visual asset in the timeline.",
            sectionId: section.id,
            beatId: beat.id,
            assetId: visualAssetId,
          }),
        );
      } else if (!(await fileExists(path.resolve(paths.projectDir, visual.path)))) {
        issues.push(
          makeIssue({
            severity: "critical",
            scope: "asset",
            code: "missing_visual_file",
            message: `Timeline visual asset file is missing: ${visual.path}`,
            sectionId: section.id,
            beatId: beat.id,
            assetId: visual.id,
          }),
        );
      }
      if (!voice) {
        issues.push(
          makeIssue({
            severity: "critical",
            scope: "beat",
            code: "missing_voiceover",
            message: "Beat is missing a voiceover asset.",
            sectionId: section.id,
            beatId: beat.id,
          }),
        );
      }
      if (voice && !voice.source?.audioProcessing) {
        issues.push(
          makeIssue({
            severity: "warning",
            scope: "asset",
            code: "missing_audio_processing_metadata",
            message: "Voiceover asset is missing loudness/processing metadata.",
            sectionId: section.id,
            beatId: beat.id,
            assetId: voice.id,
          }),
        );
      }

      if (segment) {
        const min = beat.timing.preferredMinSeconds;
        const max = beat.timing.preferredMaxSeconds;
        if (typeof min === "number" && segment.durationSeconds < min) {
          issues.push(
            makeIssue({
              severity: "warning",
              scope: "beat",
              code: "duration_below_preferred_min",
              message: `Beat duration ${segment.durationSeconds.toFixed(2)}s is below preferred minimum ${min.toFixed(2)}s.`,
              sectionId: section.id,
              beatId: beat.id,
            }),
          );
        }
        if (typeof max === "number" && segment.durationSeconds > max) {
          issues.push(
            makeIssue({
              severity: "warning",
              scope: "beat",
              code: "duration_above_preferred_max",
              message: `Beat duration ${segment.durationSeconds.toFixed(2)}s is above preferred maximum ${max.toFixed(2)}s.`,
              sectionId: section.id,
              beatId: beat.id,
            }),
          );
        }
      }

      for (const caption of captionsByBeat.get(beat.id) ?? []) {
        if (countWords(caption.text) <= 2) {
          issues.push(
            makeIssue({
              severity: "warning",
              scope: "beat",
              code: "caption_fragment_too_short",
              message: "Caption fragment is too short (1-2 words).",
              sectionId: section.id,
              beatId: beat.id,
            }),
          );
        }
        if (caption.text.length > 56) {
          issues.push(
            makeIssue({
              severity: "warning",
              scope: "beat",
              code: "caption_line_too_long",
              message: "Caption line is likely too long for vertical video readability.",
              sectionId: section.id,
              beatId: beat.id,
            }),
          );
        }
      }
    }
  }

  for (const asset of manifest.assets) {
    if (asset.status === "failed" || asset.status === "stale") {
      issues.push(
        makeIssue({
          severity: asset.status === "failed" ? "critical" : "warning",
          scope: "asset",
          code: asset.status === "failed" ? "asset_failed" : "asset_stale",
          message: `Asset status is ${asset.status}.`,
          sectionId: asset.sectionId,
          beatId: asset.beatId,
          assetId: asset.id,
        }),
      );
    }
  }

  const rawPlanText = await readFile(paths.videoPlan, "utf8");
  const rawPlanData = JSON.parse(rawPlanText);
  const legacyUsage = findLegacyBeatFieldUsages(rawPlanData);
  if (legacyUsage.total > 0) {
    const sample = legacyUsage.usages
      .slice(0, 3)
      .map((usage) => `${usage.beatId ?? "unknown"}:${usage.field}`)
      .join(", ");
    issues.push(
      makeIssue({
        severity: "warning",
        scope: "project",
        code: "legacy_beat_fields_present",
        message: `video-plan.json still contains ${legacyUsage.total} legacy beat field occurrence(s) (voiceDirection/sfxCues/editorial). Sample: ${sample}`,
      }),
    );
  }

  const planHash = hashString(rawPlanText);
  const timelineHash = await readFile(path.join(paths.projectDir, "timeline.json"), "utf8")
    .then(hashString)
    .catch(() => "");
  const runState = await readFile(
    path.join(paths.rootDir, ".studio-data", "run-state", `${projectId}.json`),
    "utf8",
  )
    .then((raw) => JSON.parse(raw))
    .catch(() => ({}));
  if (
    runState.lastRenderPlanHash &&
    (runState.lastRenderPlanHash !== planHash || runState.lastRenderTimelineHash !== timelineHash)
  ) {
    issues.push(
      makeIssue({
        severity: "warning",
        scope: "render",
        code: "render_stale",
        message: "Latest render is stale compared with current plan/timeline.",
      }),
    );
  }

  const summary = issues.reduce(
    (acc, issue) => ({ ...acc, [issue.severity]: acc[issue.severity] + 1 }),
    { critical: 0, warning: 0, suggestion: 0 },
  );

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    summary,
    issues,
  };
}
