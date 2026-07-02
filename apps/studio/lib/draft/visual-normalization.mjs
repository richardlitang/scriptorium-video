import { clampNumber } from "./normalization-numbers.mjs";

export function normalizeReferencePriority(value, fallback = "medium") {
  if (value === "low" || value === "medium" || value === "high") return value;
  return fallback;
}

export function normalizeReferenceIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))].slice(0, 8);
}

function validOr(value, validValues, conservative, conservativeDefault, normalDefault) {
  if (validValues.includes(value)) return value;
  return conservative ? conservativeDefault : normalDefault;
}

const SCALE_MODES = ["safe_cover", "contain_blur", "cover", "contain", "stretch"];
const SUBJECT_POSITIONS = ["center", "upper_center", "lower_center", "left", "right"];
const CROP_RISKS = ["low", "medium", "high"];
const MOTION_STRENGTHS = ["subtle", "medium", "strong"];

export function normalizeDraftVisualFraming(beatDraft = {}, conservativeVisual = false) {
  const scaleMode = validOr(
    beatDraft.scaleMode,
    SCALE_MODES,
    conservativeVisual,
    "contain_blur",
    "safe_cover",
  );
  const subjectPosition = SUBJECT_POSITIONS.includes(beatDraft.subjectPosition)
    ? beatDraft.subjectPosition
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

export function normalizeDraftVisualReferences(beatDraft = {}) {
  return {
    referenceIds: normalizeReferenceIds(beatDraft.referenceIds),
    referencePriority: normalizeReferencePriority(beatDraft.referencePriority, "medium"),
  };
}

export function motionIntensityForBeat(motionStrength, cropRisk) {
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
  const base = baseByStrength[motionStrength] ?? 0.12;
  const capped = Math.min(base, capByRisk[cropRisk] ?? 0.14);
  return clampNumber(capped, 0.1, 0.02, 0.24);
}
