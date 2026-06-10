type PlannerSelfReviewInput = {
  estimatedSourceCoverageRatio?: unknown;
  containsInventedChannelCta?: unknown;
  introHookPlacement?: unknown;
  orderingConfidence?: unknown;
  coverageNotes?: unknown;
};

type PlannerReview = {
  estimatedSourceCoverageRatio: number;
  containsInventedChannelCta: boolean;
  introHookPlacement: "none" | "opening" | "middle" | "late_or_ending";
  orderingConfidence: number;
  coverageNotes: string;
};

type PlannerBeat = {
  narration?: string;
  imageChangeDecision?: string;
};

type PlannerSection = {
  beats?: PlannerBeat[];
};

type PlannerPlan = {
  sections?: PlannerSection[];
};

export type PlannerHealthMetrics = {
  storyWords: number;
  narrationWords: number;
  ratio: number;
  beatCount: number;
  placeholderHits: number;
  shortNarrationBeats: number;
  changeDecisions: number;
  plannerSelfReview: PlannerReview;
};

function countWords(value: unknown): number {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizePlannerSelfReview(value: PlannerSelfReviewInput = {}): PlannerReview {
  const introHookPlacement = ["none", "opening", "middle", "late_or_ending"].includes(
    String(value.introHookPlacement),
  )
    ? (value.introHookPlacement as PlannerReview["introHookPlacement"])
    : "none";
  return {
    estimatedSourceCoverageRatio: clampNumber(value.estimatedSourceCoverageRatio, 1, 0, 1),
    containsInventedChannelCta: value.containsInventedChannelCta === true,
    introHookPlacement,
    orderingConfidence: clampNumber(value.orderingConfidence, 1, 0, 1),
    coverageNotes: String(value.coverageNotes || ""),
  };
}

export function planNarrationHealth(
  plan: PlannerPlan,
  storyText = "",
  plannerSelfReview: PlannerSelfReviewInput = {},
): PlannerHealthMetrics {
  const storyWords = countWords(storyText);
  const beats = plan.sections?.flatMap((section) => section.beats ?? []) ?? [];
  const narrationWords = beats.reduce((sum, beat) => sum + countWords(beat.narration), 0);
  const ratio = storyWords > 0 ? narrationWords / storyWords : 1;
  const normalizedPlannerReview = normalizePlannerSelfReview(plannerSelfReview);
  const placeholderHits = beats.filter((beat) =>
    String(beat.narration || "")
      .toLowerCase()
      .includes("replace this narration with your first beat"),
  ).length;
  const shortNarrationBeats = beats.filter((beat) => countWords(beat.narration) < 3).length;
  const changeDecisions = beats.filter(
    (beat) => String(beat.imageChangeDecision || "").toLowerCase() === "change",
  ).length;
  return {
    storyWords,
    narrationWords,
    ratio,
    beatCount: beats.length,
    placeholderHits,
    shortNarrationBeats,
    changeDecisions,
    plannerSelfReview: normalizedPlannerReview,
  };
}

export function plannerBlockingFailures(metrics: PlannerHealthMetrics): string[] {
  const failures: string[] = [];
  if (metrics.placeholderHits > 0) {
    failures.push(`${metrics.placeholderHits} placeholder narration beat(s)`);
  }
  if (metrics.beatCount === 0) failures.push("planner returned no beats");
  if (metrics.narrationWords === 0) failures.push("planner returned no narration");
  return failures;
}

export function plannerQualityIsUsable(metrics: PlannerHealthMetrics): boolean {
  return plannerBlockingFailures(metrics).length === 0;
}

export function plannerQualityWarnings(metrics: PlannerHealthMetrics): string[] {
  const warnings: string[] = [];
  if (metrics.beatCount > 0 && metrics.shortNarrationBeats / metrics.beatCount > 0.2) {
    warnings.push(
      `${metrics.shortNarrationBeats}/${metrics.beatCount} beats have fewer than 3 words`,
    );
  }
  if (metrics.storyWords >= 80 && metrics.ratio < 0.65) {
    warnings.push(`narration retained ${(metrics.ratio * 100).toFixed(1)}% of source`);
  }
  if (metrics.storyWords >= 80 && metrics.plannerSelfReview.estimatedSourceCoverageRatio < 0.65) {
    warnings.push(
      `planner self-rated coverage ${(metrics.plannerSelfReview.estimatedSourceCoverageRatio * 100).toFixed(1)}%`,
    );
  }
  if (metrics.plannerSelfReview.containsInventedChannelCta) {
    warnings.push("planner reported invented channel CTA");
  }
  if (metrics.plannerSelfReview.introHookPlacement === "late_or_ending") {
    warnings.push("planner reported intro hook near the ending");
  }
  if (metrics.plannerSelfReview.orderingConfidence < 0.6) {
    warnings.push(
      `planner ordering confidence ${(metrics.plannerSelfReview.orderingConfidence * 100).toFixed(1)}%`,
    );
  }
  return warnings;
}

export function plannerBlockingFailureMessage(quality: PlannerHealthMetrics): string {
  const failures = plannerBlockingFailures(quality);
  if (failures.length === 0) return "Planner output is usable.";
  return `Planner output is unusable: ${failures.join("; ")}. ratio=${quality.ratio.toFixed(3)}, beats=${quality.beatCount}, coverage=${quality.plannerSelfReview.estimatedSourceCoverageRatio.toFixed(3)}, introHookPlacement=${quality.plannerSelfReview.introHookPlacement}, inventedCta=${quality.plannerSelfReview.containsInventedChannelCta}.`;
}

export function plannerQualityWarningSummary(quality: PlannerHealthMetrics): string {
  const warnings = plannerQualityWarnings(quality);
  if (warnings.length === 0) return "";
  return `Planner review warnings:\n${warnings.join("\n")}\nratio=${quality.ratio.toFixed(3)}, beats=${quality.beatCount}, coverage=${quality.plannerSelfReview.estimatedSourceCoverageRatio.toFixed(3)}, introHookPlacement=${quality.plannerSelfReview.introHookPlacement}, inventedCta=${quality.plannerSelfReview.containsInventedChannelCta}`;
}

export function plannerProgressLabel(
  prefix: string,
  progress: {
    elapsedMs?: unknown;
    attempt?: unknown;
    attempts?: unknown;
    model?: unknown;
    event?: unknown;
  } = {},
): string {
  const seconds = Math.max(0, Math.round(Number(progress.elapsedMs ?? 0) / 1000));
  const attemptText = `attempt ${Number(progress.attempt ?? 1)}/${Number(progress.attempts ?? 1)}`;
  const modelText = progress.model ? `${progress.model}` : "OpenAI";
  if (progress.event === "request.response") {
    return `${prefix}: response received from ${modelText}`;
  }
  if (progress.event === "request.retryable_error" || progress.event === "request.error") {
    return `${prefix}: ${modelText} error after ${seconds}s`;
  }
  return `${prefix}: waiting on ${modelText} · ${attemptText} · ${seconds}s`;
}
