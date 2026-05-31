function clampNumber(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

export function normalizeCaptionTuning(tuning = {}) {
  return {
    targetMaxWords: clampInteger(tuning.targetMaxWords, 14, 4, 30),
    hardMaxWords: clampInteger(tuning.hardMaxWords, 18, 6, 40),
    targetMaxDurationSeconds: clampNumber(tuning.targetMaxDurationSeconds, 4.5, 1.5, 12),
    hardMaxDurationSeconds: clampNumber(tuning.hardMaxDurationSeconds, 6, 2, 14),
    minWordsBeforeSentenceBreak: clampInteger(tuning.minWordsBeforeSentenceBreak, 3, 2, 20),
  };
}
