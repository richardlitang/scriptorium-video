function clampNumber(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeReferencePriority(value, fallback = "medium") {
  if (value === "low" || value === "medium" || value === "high") return value;
  return fallback;
}

export function normalizeReferenceIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))].slice(0, 8);
}

export function normalizeDraftVisualFraming(beatDraft = {}, conservativeVisual = false) {
  const scaleMode = ["safe_cover", "contain_blur", "cover", "contain", "stretch"].includes(
    beatDraft.scaleMode,
  )
    ? beatDraft.scaleMode
    : conservativeVisual
      ? "contain_blur"
      : "safe_cover";
  const subjectPosition = ["center", "upper_center", "lower_center", "left", "right"].includes(
    beatDraft.subjectPosition,
  )
    ? beatDraft.subjectPosition
    : "center";
  const cropRisk = ["low", "medium", "high"].includes(beatDraft.cropRisk)
    ? beatDraft.cropRisk
    : conservativeVisual
      ? "high"
      : "medium";
  const motionStrength = ["subtle", "medium", "strong"].includes(beatDraft.motionStrength)
    ? beatDraft.motionStrength
    : conservativeVisual
      ? "subtle"
      : "medium";
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
