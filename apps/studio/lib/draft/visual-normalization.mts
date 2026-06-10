type VisualNormalizationInput = {
  scaleMode?: unknown;
  subjectPosition?: unknown;
  cropRisk?: unknown;
  motionStrength?: unknown;
  referenceIds?: unknown[];
  referencePriority?: unknown;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeReferencePriority(
  value: unknown,
  fallback: "low" | "medium" | "high" = "medium",
): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  return fallback;
}

export function normalizeReferenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))].slice(0, 8);
}

function validOr<T extends string>(
  value: unknown,
  validValues: readonly T[],
  conservative: boolean,
  conservativeDefault: T,
  normalDefault: T,
): T {
  if (validValues.includes(value as T)) return value as T;
  return conservative ? conservativeDefault : normalDefault;
}

const SCALE_MODES = ["safe_cover", "contain_blur", "cover", "contain", "stretch"] as const;
const SUBJECT_POSITIONS = ["center", "upper_center", "lower_center", "left", "right"] as const;
const CROP_RISKS = ["low", "medium", "high"] as const;
const MOTION_STRENGTHS = ["subtle", "medium", "strong"] as const;

export function normalizeDraftVisualFraming(
  beatDraft: VisualNormalizationInput = {},
  conservativeVisual = false,
) {
  const scaleMode = validOr(
    beatDraft.scaleMode,
    SCALE_MODES,
    conservativeVisual,
    "contain_blur",
    "safe_cover",
  );
  const subjectPosition = SUBJECT_POSITIONS.includes(beatDraft.subjectPosition as (typeof SUBJECT_POSITIONS)[number])
    ? (beatDraft.subjectPosition as (typeof SUBJECT_POSITIONS)[number])
    : "center";
  const cropRisk = validOr(beatDraft.cropRisk, CROP_RISKS, conservativeVisual, "high", "medium");
  const motionStrength = validOr(
    beatDraft.motionStrength,
    MOTION_STRENGTHS,
    conservativeVisual,
    "subtle",
    "medium",
  );
  return { scaleMode, subjectPosition, cropRisk, motionStrength };
}

export function normalizeDraftVisualReferences(beatDraft: VisualNormalizationInput = {}) {
  return {
    referenceIds: normalizeReferenceIds(beatDraft.referenceIds),
    referencePriority: normalizeReferencePriority(beatDraft.referencePriority, "medium"),
  };
}

export function motionIntensityForBeat(
  motionStrength: unknown,
  cropRisk: unknown,
): number {
  const baseByStrength = {
    subtle: 0.06,
    medium: 0.12,
    strong: 0.18,
  };
  const capByRisk = {
    low: 0.18,
    medium: 0.14,
    high: 0.1,
  };
  const base = baseByStrength[String(motionStrength) as keyof typeof baseByStrength] ?? 0.12;
  const capped = Math.min(
    base,
    capByRisk[String(cropRisk) as keyof typeof capByRisk] ?? 0.14,
  );
  return clampNumber(capped, 0.1, 0.02, 0.24);
}
