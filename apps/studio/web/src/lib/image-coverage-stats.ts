// Ported from public/modules/image-coverage-stats.js

import type { Asset } from "@/api/client";

export function ownedVisualAssetForBeat(assets: Asset[], beatId: string): Asset | undefined {
  return assets.find((a) => a["role"] === "primary_visual" && a["beatId"] === beatId);
}

export function currentVisualCoverageFromPlan(
  plan: Record<string, unknown>,
  assets: Asset[],
  coverage: string,
): { missing: number; total: number } {
  const sections =
    (plan["sections"] as { beats?: { id: string; visual?: { coverageRole?: string } }[] }[]) ?? [];

  if (coverage === "beat") {
    const beats = sections.flatMap((s) => s.beats ?? []);
    return {
      missing: beats.filter((b) => !ownedVisualAssetForBeat(assets, b.id)).length,
      total: beats.length,
    };
  }
  if (coverage === "balanced") {
    const targets = sections.flatMap((s) => {
      const beats = s.beats ?? [];
      if (beats.length <= 2) return beats;
      return [beats[0], beats[Math.floor(beats.length / 2)], beats[beats.length - 1]].filter(
        (b, i, all) => all.findIndex((e) => e?.id === b?.id) === i,
      );
    });
    return {
      missing: targets.filter((b) => !ownedVisualAssetForBeat(assets, b.id)).length,
      total: targets.length,
    };
  }
  if (coverage === "llm") {
    const beats = sections.flatMap((s) => s.beats ?? []);
    const targets = beats
      .filter((b, i) => {
        const role = b.visual?.coverageRole;
        return role === "anchor" || role === "key_moment" || i === 0;
      })
      .filter((b, i, all) => all.findIndex((e) => e?.id === b?.id) === i);
    return {
      missing: targets.filter((b) => !ownedVisualAssetForBeat(assets, b.id)).length,
      total: targets.length,
    };
  }
  // fallback: section-level coverage
  const missing = sections.filter(
    (s) => !(s.beats ?? []).some((b) => ownedVisualAssetForBeat(assets, b.id)),
  );
  return { missing: missing.length, total: sections.length };
}
