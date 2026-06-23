import type { QualityFinding, RenderBundle } from "@lvstudio/core";

type VideoPlanSection = RenderBundle["videoPlan"]["sections"][number];

function normalizePrompt(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getBeatPromptText(beat: VideoPlanSection["beats"][number]): string {
  const fallbackPrompt = normalizePrompt(beat.media?.[0]?.prompt || beat.notes || "");
  const visualPrompt = normalizePrompt(beat.visual?.prompt || "");
  return visualPrompt || fallbackPrompt;
}

export function collectVisualPromptRepetitionChecks(
  sections: VideoPlanSection[],
): QualityFinding[] {
  const promptCounts = new Map<string, number>();
  for (const section of sections) {
    for (const beat of section.beats) {
      const promptText = getBeatPromptText(beat);
      if (!promptText) continue;
      promptCounts.set(promptText, (promptCounts.get(promptText) || 0) + 1);
    }
  }

  const checks: QualityFinding[] = [];
  for (const [prompt, count] of promptCounts.entries()) {
    if (count >= 3) {
      checks.push({
        id: "shared.visual.prompt_repetition",
        severity: "warning",
        message: `A visual prompt pattern repeats ${count} times; expect continuity drift or repetitive shots.`,
        path: prompt.slice(0, 120),
        data: { repeatedCount: count },
      });
    }
  }
  return checks;
}
