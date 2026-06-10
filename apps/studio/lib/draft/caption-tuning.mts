type CaptionTuningInput = {
  targetMaxWords?: unknown;
  hardMaxWords?: unknown;
  targetMaxDurationSeconds?: unknown;
  hardMaxDurationSeconds?: unknown;
  minWordsBeforeSentenceBreak?: unknown;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

export function normalizeCaptionTuning(tuning: CaptionTuningInput = {}) {
  return {
    targetMaxWords: clampInteger(tuning.targetMaxWords, 14, 4, 30),
    hardMaxWords: clampInteger(tuning.hardMaxWords, 18, 6, 40),
    targetMaxDurationSeconds: clampNumber(tuning.targetMaxDurationSeconds, 4.5, 1.5, 12),
    hardMaxDurationSeconds: clampNumber(tuning.hardMaxDurationSeconds, 6, 2, 14),
    minWordsBeforeSentenceBreak: clampInteger(tuning.minWordsBeforeSentenceBreak, 3, 2, 20),
  };
}
