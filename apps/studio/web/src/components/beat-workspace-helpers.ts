import type { Asset } from "@/api/client";
import type { Beat, Plan, Section } from "./beat-workspace-types";

export function visualAssetForBeat(assets: Asset[], beatId: string): Asset | undefined {
  return assets.find((a) => a["role"] === "primary_visual" && a["beatId"] === beatId);
}

export function voiceAssetForBeat(assets: Asset[], beatId: string): Asset | undefined {
  return assets.find((a) => a["role"] === "voiceover" && a["beatId"] === beatId);
}

export function beatDurationSeconds(
  beatId: string,
  timeline: Record<string, unknown> | null,
): number {
  const beats =
    (timeline?.["beats"] as { id: string; durationSeconds?: number }[] | undefined) ?? [];
  return beats.find((b) => b.id === beatId)?.durationSeconds ?? 0;
}

export function pauseMsToSeconds(ms?: number, fallbackSeconds = 0): number {
  if (typeof ms === "number" && Number.isFinite(ms))
    return Number((Math.max(0, Math.min(1200, ms)) / 1000).toFixed(2));
  return Number(Math.max(0, Math.min(1.2, fallbackSeconds)).toFixed(2));
}

export function findBeatInPlan(
  plan: Plan,
  beatId: string | null,
): { beat: Beat; section: Section } | null {
  if (!beatId) return null;
  for (const section of plan.sections ?? []) {
    const beat = section.beats?.find((b) => b.id === beatId);
    if (beat) return { beat, section };
  }
  return null;
}

export function imageChipLabel(imgAsset: Asset | undefined, beatId: string): string {
  if (!imgAsset) return "no img";
  return imgAsset["beatId"] !== beatId ? "reused" : "img";
}

export function imageAssetStatus(imgAsset: Asset | undefined, beatId: string): string {
  if (!imgAsset) return "missing";
  if (imgAsset["beatId"] !== beatId) return `reused (${imgAsset["beatId"]})`;
  return String(imgAsset["status"]);
}
