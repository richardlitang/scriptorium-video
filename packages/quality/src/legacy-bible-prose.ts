const MARKERS = ["Character bible", "Location bible", "Object bible"];

type BeatLike = { id?: string; notes?: string; media?: Array<{ prompt?: string }> };
type PlanLike = { sections?: Array<{ beats?: BeatLike[] }> };

export function detectLegacyBibleProse(plan: PlanLike): string[] {
  const warnings: string[] = [];
  for (const section of plan.sections ?? []) {
    for (const beat of section.beats ?? []) {
      const haystack = [beat.notes ?? "", ...(beat.media ?? []).map((m) => m.prompt ?? "")].join(
        "\n",
      );
      if (MARKERS.some((marker) => haystack.includes(marker))) {
        warnings.push(
          `Beat ${beat.id ?? "(unknown)"} embeds legacy visual-bible prose; re-draft to use the structured bible and shed duplicated text.`,
        );
      }
    }
  }
  return warnings;
}
