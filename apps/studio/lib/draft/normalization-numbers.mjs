export function clampNumber(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}
