import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRenderBundle,
  QualityFindingSchema,
  QualityReportSchema,
  findLegacyBeatFieldUsages,
  getProjectPaths,
  loadProject,
} from "@lvstudio/core";

import type { QualityFinding, QualityReport } from "@lvstudio/core";

// Alias exports for consumers that already depend on the old names
export type QualityCheck = QualityFinding;
export type QualityResult = QualityReport;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function containsNonSpokenDirective(text: string): boolean {
  return /\[[^\]]*(?:background visual|sfx|cut to black|smash cut|low thud|slow pan|slow zoom)[^\]]*\]/i.test(
    text,
  );
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

function wordCount(text: string): number {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

function pauseSecondsFromDirection(
  direction:
    | {
        pauseBeforeMs?: number;
        pauseAfterMs?: number;
        pauseBeforeSeconds?: number;
        pauseAfterSeconds?: number;
      }
    | undefined,
): number {
  if (!direction) return 0;
  if (typeof direction.pauseBeforeMs === "number" || typeof direction.pauseAfterMs === "number") {
    const beforeMs = typeof direction.pauseBeforeMs === "number" ? direction.pauseBeforeMs : 0;
    const afterMs = typeof direction.pauseAfterMs === "number" ? direction.pauseAfterMs : 0;
    return (beforeMs + afterMs) / 1000;
  }
  const beforeSeconds =
    typeof direction.pauseBeforeSeconds === "number" ? direction.pauseBeforeSeconds : 0;
  const afterSeconds =
    typeof direction.pauseAfterSeconds === "number" ? direction.pauseAfterSeconds : 0;
  return beforeSeconds + afterSeconds;
}

export async function runQualityChecks(
  projectId: string,
  rootDir = process.cwd(),
): Promise<QualityResult> {
  const checks: QualityCheck[] = [];
  const loaded = await loadProject(projectId, rootDir);
  const paths = getProjectPaths(projectId, rootDir);
  const bundle = await buildRenderBundle({ projectId, rootDir });
  const rawPlanData = JSON.parse(await readFile(paths.videoPlan, "utf8"));
  const legacyUsage = findLegacyBeatFieldUsages(rawPlanData);

  checks.push({
    id: "shared.timeline.hash",
    severity: "info",
    message: "timeline.json exists and matches source plan hash.",
  });
  if (legacyUsage.total > 0) {
    checks.push({
      id: "shared.plan.legacy_beat_fields",
      severity: "warning",
      message: `video-plan.json contains ${legacyUsage.total} legacy beat field occurrence(s). Run 'lvstudio migrate:plan ${projectId}' to canonicalize.`,
      data: {
        total: legacyUsage.total,
        byField: legacyUsage.byField,
      },
    });
  }

  for (const section of loaded.videoPlan.sections) {
    let previousIntensity: number | undefined;
    for (const beat of section.beats) {
      const segment = bundle.timeline.segments.find((entry) => entry.beatId === beat.id);
      const voice = loaded.assetManifest.assets.find(
        (asset) => asset.role === "voiceover" && asset.beatId === beat.id,
      );
      const directiveOnly = isNonSpokenDirectiveOnly(beat.narration);
      if (containsNonSpokenDirective(beat.narration)) {
        checks.push({
          id: "shared.narration.production_directive",
          severity: directiveOnly ? "warning" : "error",
          message: directiveOnly
            ? `Beat ${beat.id} is a standalone production direction; sync skips it so it does not pause narration.`
            : `Beat ${beat.id} contains a bracketed production direction inside spoken narration.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}.narration`,
          beatId: beat.id,
          sectionId: section.id,
        });
      }
      if (!voice && !directiveOnly) {
        checks.push({
          id: "shared.beat.voice",
          severity: "error",
          message: `Beat ${beat.id} has no voiceover asset.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`,
          beatId: beat.id,
          sectionId: section.id,
        });
      }
      if (
        beat.media.length > 0 &&
        !directiveOnly &&
        (!segment || segment.mediaAssetIds.length === 0)
      ) {
        checks.push({
          id: "shared.beat.media",
          severity: "error",
          message: `Beat ${beat.id} references media intent but no resolved timeline media asset exists.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`,
          beatId: beat.id,
          sectionId: section.id,
        });
      }

      const pauses = pauseSecondsFromDirection(beat.voiceDirection);
      if (pauses > 1.4) {
        checks.push({
          id: "shared.voice.pause_budget",
          severity: "warning",
          message: `Beat ${beat.id} has high combined pause budget (${pauses.toFixed(2)}s).`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`,
          beatId: beat.id,
          sectionId: section.id,
          data: { pausesSeconds: Number(pauses.toFixed(3)) },
        });
      }

      const intensity = beat.voiceDirection?.intensity;
      if (
        previousIntensity !== undefined &&
        intensity !== undefined &&
        Math.abs(intensity - previousIntensity) > 0.45
      ) {
        checks.push({
          id: "shared.voice.intensity_jump",
          severity: "warning",
          message: `Beat ${beat.id} has an abrupt intensity jump from previous beat.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`,
          beatId: beat.id,
          sectionId: section.id,
          data: {
            previousIntensity,
            currentIntensity: intensity,
            delta: Math.abs(intensity - previousIntensity),
          },
        });
      }
      if (intensity !== undefined) previousIntensity = intensity;
    }
  }

  const segmentByBeatId = new Map(
    bundle.timeline.segments.map((segment) => [segment.beatId, segment]),
  );
  for (const section of loaded.videoPlan.sections) {
    for (const beat of section.beats) {
      const segment = segmentByBeatId.get(beat.id);
      if (!segment) continue;
      const spokenWords = wordCount(beat.narration);
      const maxExpectedDuration = Math.max(8, spokenWords * 1.15 + 4);
      if (
        segment.voiceAssetId &&
        spokenWords > 0 &&
        segment.durationSeconds > maxExpectedDuration
      ) {
        checks.push({
          id: "shared.voice.duration_outlier",
          severity: "warning",
          message: `Beat ${beat.id} voice duration (${segment.durationSeconds.toFixed(2)}s) is unusually long for ${spokenWords} spoken word(s).`,
          path: `timeline.segments.${beat.id}.durationSeconds`,
          beatId: beat.id,
          sectionId: section.id,
          data: {
            durationSeconds: Number(segment.durationSeconds.toFixed(3)),
            spokenWords,
            maxExpectedDuration: Number(maxExpectedDuration.toFixed(3)),
          },
        });
      }

      const visualCueCount = segment.visualEditCues?.length ?? 0;
      if (visualCueCount > 3) {
        checks.push({
          id: "shared.editorial.visual_cue_density",
          severity: "warning",
          message: `Beat ${beat.id} has ${visualCueCount} visual edit cues; consider reducing for cleaner pacing.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}.editorial.visualEditCues`,
          beatId: beat.id,
          sectionId: section.id,
          data: { visualCueCount },
        });
      }

      const silenceWindows = [...(segment.silenceWindows ?? [])].sort(
        (a, b) => a.startSeconds - b.startSeconds,
      );
      let silenceTotal = 0;
      for (let index = 0; index < silenceWindows.length; index += 1) {
        const current = silenceWindows[index];
        silenceTotal += Math.max(0, current.endSeconds - current.startSeconds);
        const previous = silenceWindows[index - 1];
        if (previous && current.startSeconds < previous.endSeconds) {
          checks.push({
            id: "shared.editorial.silence_overlap",
            severity: "warning",
            message: `Beat ${beat.id} has overlapping silence windows (${previous.id}, ${current.id}).`,
            path: `video-plan.sections.${section.id}.beats.${beat.id}.editorial.silenceWindows`,
            beatId: beat.id,
            sectionId: section.id,
            data: { previousWindowId: previous.id, currentWindowId: current.id },
          });
          break;
        }
      }
      if (segment.durationSeconds > 0 && silenceTotal / segment.durationSeconds > 0.4) {
        checks.push({
          id: "shared.editorial.silence_overuse",
          severity: "warning",
          message: `Beat ${beat.id} mutes audio for ${Math.round((silenceTotal / segment.durationSeconds) * 100)}% of its duration.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}.editorial.silenceWindows`,
          beatId: beat.id,
          sectionId: section.id,
          data: {
            silenceSeconds: Number(silenceTotal.toFixed(3)),
            segmentDurationSeconds: Number(segment.durationSeconds.toFixed(3)),
          },
        });
      }
    }
  }

  const promptCounts = new Map();
  for (const section of loaded.videoPlan.sections) {
    for (const beat of section.beats) {
      const prompt = String(beat.media?.[0]?.prompt || beat.notes || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const visualPrompt = String(beat.visual?.prompt || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const promptText = visualPrompt || prompt;
      if (!promptText) continue;
      promptCounts.set(promptText, (promptCounts.get(promptText) || 0) + 1);
    }
  }
  for (const [prompt, count] of promptCounts.entries()) {
    if (count >= 3) {
      checks.push({
        id: "shared.visual.prompt_repetition",
        severity: "warning",
        message: `A visual prompt pattern repeats ${count} times; expect continuity drift or repetitive shots.`,
        path: prompt.slice(0, 120),
        data: { repeatedCount: count },
      });
    }
  }

  for (const asset of loaded.assetManifest.assets) {
    const absolutePath = path.resolve(paths.projectDir, asset.path);
    const exists = await fileExists(absolutePath);
    if (!exists) {
      checks.push({
        id: "shared.asset.exists",
        severity: "error",
        message: `Asset file is missing: ${asset.path}`,
        path: asset.path,
      });
    }
  }

  if (bundle.videoPlan.mode === "short_story") {
    const first = bundle.timeline.segments[0];
    if (first && first.startSeconds > 3) {
      checks.push({
        id: "short_story.hook_within_3s",
        severity: "error",
        message: "First beat starts after 3 seconds; hook timing violated.",
      });
    }
    if (first && first.durationSeconds > 4) {
      checks.push({
        id: "short_story.first_beat_duration",
        severity: "warning",
        message: "First beat duration exceeds 4 seconds.",
      });
    }
    for (const segment of bundle.timeline.segments) {
      if (segment.durationSeconds > 7) {
        checks.push({
          id: "short_story.max_beat_duration",
          severity: "error",
          message: `Beat ${segment.beatId} exceeds 7 seconds.`,
          beatId: segment.beatId,
          sectionId: segment.sectionId,
          data: { durationSeconds: segment.durationSeconds },
        });
      }
      if (segment.durationSeconds > 6) {
        checks.push({
          id: "short_story.visual_change_frequency",
          severity: "warning",
          message: `Beat ${segment.beatId} exceeds 6 seconds without guaranteed visual change.`,
          beatId: segment.beatId,
          sectionId: segment.sectionId,
          data: { durationSeconds: segment.durationSeconds },
        });
      }
    }
    const finalSegment = bundle.timeline.segments[bundle.timeline.segments.length - 1];
    if (
      finalSegment?.endingPolicy?.cutToBlack &&
      (finalSegment.endingPolicy.holdSeconds ?? 0) < 0.6
    ) {
      checks.push({
        id: "short_story.ending_black_hold",
        severity: "warning",
        message:
          "Final cut-to-black hold is very short (<0.6s); completion-view effect may be weak.",
        beatId: finalSegment.beatId,
        sectionId: finalSegment.sectionId,
        data: { holdSeconds: finalSegment.endingPolicy.holdSeconds ?? 0 },
      });
    }
    if (!loaded.captions || loaded.captions.captions.length === 0) {
      checks.push({
        id: "short_story.captions_required",
        severity: "error",
        message: "Captions are required for short_story mode.",
      });
    } else {
      for (const caption of loaded.captions.captions) {
        const words = caption.text.split(/\s+/).filter(Boolean).length;
        if (words > 7) {
          checks.push({
            id: "short_story.caption_words",
            severity: "error",
            message: `Caption ${caption.id} exceeds 7 words.`,
            data: { captionId: caption.id, words },
          });
        }
      }
    }
  }

  if (bundle.videoPlan.mode === "long_documentary") {
    if (bundle.timeline.durationSeconds > 300 && bundle.videoPlan.sections.length < 2) {
      checks.push({
        id: "long_documentary.section_count",
        severity: "error",
        message: "Long documentary over 5 minutes must have at least 2 sections.",
      });
    }
    for (const section of bundle.videoPlan.sections) {
      if (!section.purpose) {
        checks.push({
          id: "long_documentary.section_purpose",
          severity: "warning",
          message: `Section ${section.id} is missing a purpose.`,
          sectionId: section.id,
        });
      }
    }
    const intro = bundle.timeline.segments[0];
    if (intro && intro.startSeconds > 30) {
      checks.push({
        id: "long_documentary.intro_promise_window",
        severity: "warning",
        message: "Opening promise/question may start after 30 seconds.",
      });
    }
  }

  const hasError = checks.some((check) => check.severity === "error");
  const hasWarning = checks.some((check) => check.severity === "warning");
  let overallStatus: "fail" | "warn" | "pass" = "pass";
  if (hasError) overallStatus = "fail";
  else if (hasWarning) overallStatus = "warn";
  const result = {
    status: overallStatus,
    checks,
  };
  return QualityReportSchema.parse({
    ...result,
    checks: result.checks.map((check) => QualityFindingSchema.parse(check)),
  });
}
