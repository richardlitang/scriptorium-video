type DraftCue = {
  id?: unknown;
  type?: unknown;
  placement?: unknown;
  offsetSeconds?: unknown;
  durationSeconds?: unknown;
  target?: unknown;
  intensity?: unknown;
};

type DraftSilenceWindow = {
  id?: unknown;
  placement?: unknown;
  offsetSeconds?: unknown;
  durationSeconds?: unknown;
  muteMusic?: unknown;
  muteSfx?: unknown;
  keepVoice?: unknown;
};

type DraftEndingPolicy = {
  cutToBlack?: unknown;
  holdSeconds?: unknown;
  audioPolicy?: unknown;
  avoidOutro?: unknown;
};

type DraftEditorialInput = {
  visualEditCues?: DraftCue[];
  silenceWindows?: DraftSilenceWindow[];
  endingPolicy?: DraftEndingPolicy;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeDraftEditorial(beatDraft: DraftEditorialInput = {}) {
  const visualEditCues = Array.isArray(beatDraft.visualEditCues)
    ? beatDraft.visualEditCues.slice(0, 4).map((cue, index) => ({
        id: String(cue.id || `edit-${index + 1}`),
        type: [
          "smash_cut",
          "cut_to_black",
          "hold_black",
          "j_cut",
          "l_cut",
          "slow_pan",
          "push_in",
          "hard_cut",
          "match_cut",
        ].includes(String(cue.type))
          ? String(cue.type)
          : "hard_cut",
        placement: ["beat_start", "beat_end", "key_point", "manual"].includes(String(cue.placement))
          ? String(cue.placement)
          : "manual",
        offsetSeconds: clampNumber(cue.offsetSeconds, 0, -5, 5),
        durationSeconds: clampNumber(cue.durationSeconds, 0.4, 0, 8),
        target: cue.target === "black" ? "black" : "current_visual",
        intensity: clampNumber(cue.intensity, 0.5, 0, 1),
      }))
    : [];
  const silenceWindows = Array.isArray(beatDraft.silenceWindows)
    ? beatDraft.silenceWindows.slice(0, 2).map((window, index) => ({
        id: String(window.id || `silence-${index + 1}`),
        placement: ["beat_start", "beat_end", "before_reveal", "manual"].includes(
          String(window.placement),
        )
          ? String(window.placement)
          : "manual",
        offsetSeconds: clampNumber(window.offsetSeconds, 0, -5, 5),
        durationSeconds: clampNumber(window.durationSeconds, 0.8, 0.1, 5),
        muteMusic: window.muteMusic !== false,
        muteSfx: window.muteSfx !== false,
        keepVoice: window.keepVoice === true,
      }))
    : [];
  const endingPolicy =
    beatDraft.endingPolicy && typeof beatDraft.endingPolicy === "object"
      ? {
          cutToBlack: beatDraft.endingPolicy.cutToBlack === true,
          holdSeconds: clampNumber(beatDraft.endingPolicy.holdSeconds, 0, 0, 4),
          audioPolicy: ["hard_silence", "fade_out", "none"].includes(
            String(beatDraft.endingPolicy.audioPolicy),
          )
            ? String(beatDraft.endingPolicy.audioPolicy)
            : "none",
          avoidOutro: beatDraft.endingPolicy.avoidOutro === true,
        }
      : undefined;
  if (visualEditCues.length === 0 && silenceWindows.length === 0 && !endingPolicy) return undefined;
  return { visualEditCues, silenceWindows, endingPolicy };
}
