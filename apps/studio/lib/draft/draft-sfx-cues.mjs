import { clampNumber } from "./normalization-numbers.mjs";

export function normalizeDraftSfxCues(beatDraft = {}) {
  if (!Array.isArray(beatDraft.sfxCues)) return [];
  return beatDraft.sfxCues.slice(0, 6).map((cue, index) => ({
    id: String(cue.id || `cue-${index + 1}`),
    kind: String(cue.kind || "ambience"),
    placement: ["beat_start", "beat_end", "key_point", "manual"].includes(cue.placement)
      ? cue.placement
      : "manual",
    offsetSeconds: clampNumber(cue.offsetSeconds, 0, -5, 5),
    levelDb: clampNumber(cue.levelDb, -16, -48, 12),
    pan: clampNumber(cue.pan, 0, -1, 1),
    proximity: ["distant", "room", "close", "close_mic"].includes(cue.proximity)
      ? cue.proximity
      : "room",
    duckMusic: cue.duckMusic === true,
  }));
}
