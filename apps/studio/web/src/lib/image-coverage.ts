type ImageCoverage = "llm" | "beat" | "balanced";

export function normalizeImageCoverage(value: string): ImageCoverage {
  if (value === "llm" || value === "story" || value === "global") return "llm";
  if (value === "beat" || value === "999") return "beat";
  if (value === "balanced" || value === "key") return "balanced";
  return "llm";
}

export function imageCoverageLabel(coverage: string): string {
  if (coverage === "llm") return "llm story-driven changes";
  if (coverage === "beat") return "full beat-by-beat";
  if (coverage === "balanced") return "balanced key moments";
  return "llm story-driven changes";
}
