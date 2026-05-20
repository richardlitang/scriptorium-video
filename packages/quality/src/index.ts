import { access } from "node:fs/promises";
import path from "node:path";
import {
  buildRenderBundle,
  getProjectPaths,
  loadProject
} from "@lvstudio/core";

export type QualityCheck = {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
};

export type QualityResult = {
  status: "pass" | "warn" | "fail";
  checks: QualityCheck[];
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runQualityChecks(projectId: string, rootDir = process.cwd()): Promise<QualityResult> {
  const checks: QualityCheck[] = [];
  const loaded = await loadProject(projectId, rootDir);
  const paths = getProjectPaths(projectId, rootDir);
  const bundle = await buildRenderBundle({ projectId, rootDir });

  checks.push({
    id: "shared.timeline.hash",
    severity: "info",
    message: "timeline.json exists and matches source plan hash."
  });

  for (const section of loaded.videoPlan.sections) {
    let previousIntensity: number | undefined;
    for (const beat of section.beats) {
      const voice = loaded.assetManifest.assets.find((asset) => asset.role === "voiceover" && asset.beatId === beat.id);
      const media = loaded.assetManifest.assets.filter((asset) => asset.role !== "voiceover" && asset.beatId === beat.id);
      if (!voice) {
        checks.push({
          id: "shared.beat.voice",
          severity: "error",
          message: `Beat ${beat.id} has no voiceover asset.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`
        });
      }
      if (beat.media.length > 0 && media.length === 0) {
        checks.push({
          id: "shared.beat.media",
          severity: "error",
          message: `Beat ${beat.id} references media intent but no resolved media asset exists.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`
        });
      }

      const pauses =
        (beat.voiceDirection?.pauseBeforeSeconds ?? 0) +
        (beat.voiceDirection?.pauseAfterSeconds ?? 0);
      if (pauses > 1.4) {
        checks.push({
          id: "shared.voice.pause_budget",
          severity: "warning",
          message: `Beat ${beat.id} has high combined pause budget (${pauses.toFixed(2)}s).`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`
        });
      }

      const intensity = beat.voiceDirection?.intensity;
      if (previousIntensity !== undefined && intensity !== undefined && Math.abs(intensity - previousIntensity) > 0.45) {
        checks.push({
          id: "shared.voice.intensity_jump",
          severity: "warning",
          message: `Beat ${beat.id} has an abrupt intensity jump from previous beat.`,
          path: `video-plan.sections.${section.id}.beats.${beat.id}`
        });
      }
      if (intensity !== undefined) previousIntensity = intensity;
    }
  }

  const promptCounts = new Map();
  for (const section of loaded.videoPlan.sections) {
    for (const beat of section.beats) {
      const prompt = String(beat.media?.[0]?.prompt || beat.notes || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!prompt) continue;
      promptCounts.set(prompt, (promptCounts.get(prompt) || 0) + 1);
    }
  }
  for (const [prompt, count] of promptCounts.entries()) {
    if (count >= 3) {
      checks.push({
        id: "shared.visual.prompt_repetition",
        severity: "warning",
        message: `A visual prompt pattern repeats ${count} times; expect continuity drift or repetitive shots.`,
        path: prompt.slice(0, 120)
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
        path: asset.path
      });
    }
  }

  if (bundle.videoPlan.mode === "short_story") {
    const first = bundle.timeline.segments[0];
    if (first && first.startSeconds > 3) {
      checks.push({
        id: "short_story.hook_within_3s",
        severity: "error",
        message: "First beat starts after 3 seconds; hook timing violated."
      });
    }
    if (first && first.durationSeconds > 4) {
      checks.push({
        id: "short_story.first_beat_duration",
        severity: "warning",
        message: "First beat duration exceeds 4 seconds."
      });
    }
    for (const segment of bundle.timeline.segments) {
      if (segment.durationSeconds > 7) {
        checks.push({
          id: "short_story.max_beat_duration",
          severity: "error",
          message: `Beat ${segment.beatId} exceeds 7 seconds.`
        });
      }
      if (segment.durationSeconds > 6) {
        checks.push({
          id: "short_story.visual_change_frequency",
          severity: "warning",
          message: `Beat ${segment.beatId} exceeds 6 seconds without guaranteed visual change.`
        });
      }
    }
    if (!loaded.captions || loaded.captions.captions.length === 0) {
      checks.push({
        id: "short_story.captions_required",
        severity: "error",
        message: "Captions are required for short_story mode."
      });
    } else {
      for (const caption of loaded.captions.captions) {
        const words = caption.text.split(/\s+/).filter(Boolean).length;
        if (words > 7) {
          checks.push({
            id: "short_story.caption_words",
            severity: "error",
            message: `Caption ${caption.id} exceeds 7 words.`
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
        message: "Long documentary over 5 minutes must have at least 2 sections."
      });
    }
    for (const section of bundle.videoPlan.sections) {
      if (!section.purpose) {
        checks.push({
          id: "long_documentary.section_purpose",
          severity: "warning",
          message: `Section ${section.id} is missing a purpose.`
        });
      }
    }
    const intro = bundle.timeline.segments[0];
    if (intro && intro.startSeconds > 30) {
      checks.push({
        id: "long_documentary.intro_promise_window",
        severity: "warning",
        message: "Opening promise/question may start after 30 seconds."
      });
    }
  }

  const hasError = checks.some((check) => check.severity === "error");
  const hasWarning = checks.some((check) => check.severity === "warning");
  return {
    status: hasError ? "fail" : hasWarning ? "warn" : "pass",
    checks
  };
}
