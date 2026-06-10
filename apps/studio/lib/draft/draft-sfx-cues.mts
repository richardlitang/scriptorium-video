type DraftSfxCue = {
  id?: unknown;
  kind?: unknown;
  placement?: unknown;
  offsetSeconds?: unknown;
  levelDb?: unknown;
  pan?: unknown;
  proximity?: unknown;
  duckMusic?: unknown;
};

type DraftSfxInput = {
  sfxCues?: DraftSfxCue[];
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeDraftSfxCues(beatDraft: DraftSfxInput = {}) {
  if (!Array.isArray(beatDraft.sfxCues)) return [];
  return beatDraft.sfxCues.slice(0, 6).map((cue, index) => ({
    id: String(cue.id || `cue-${index + 1}`),
    kind: String(cue.kind || "ambience"),
    placement: ["beat_start", "beat_end", "key_point", "manual"].includes(String(cue.placement))
      ? String(cue.placement)
      : "manual",
    offsetSeconds: clampNumber(cue.offsetSeconds, 0, -5, 5),
    levelDb: clampNumber(cue.levelDb, -16, -48, 12),
    pan: clampNumber(cue.pan, 0, -1, 1),
    proximity: ["distant", "room", "close", "close_mic"].includes(String(cue.proximity))
      ? String(cue.proximity)
      : "room",
    duckMusic: cue.duckMusic === true,
  }));
}
