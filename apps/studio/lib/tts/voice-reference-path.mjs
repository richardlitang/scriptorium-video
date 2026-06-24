import path from "node:path";

// Voice reference paths come from two sources: absolute paths written by the
// upload route, and repo-relative paths baked into presets (bundled assets).
// Resolve relative values against the studio root so both work the same way
// at generation and preview time. Empty/blank values mean "no reference".
export function resolveVoiceReferencePath(value, rootDir) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  if (path.isAbsolute(trimmed)) return trimmed;
  if (!rootDir) return trimmed;
  return path.resolve(rootDir, trimmed);
}
