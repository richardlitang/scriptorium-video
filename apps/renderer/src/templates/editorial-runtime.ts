import type { CSSProperties } from "react";

export type SilenceWindow = {
  startSeconds: number;
  endSeconds: number;
  muteMusic: boolean;
  muteSfx: boolean;
  keepVoice: boolean;
};

export type VisualEditCue = {
  type: "smash_cut" | "cut_to_black" | "hold_black" | "j_cut" | "l_cut" | "slow_pan" | "push_in" | "hard_cut" | "match_cut";
  startSeconds: number;
  durationSeconds: number;
  target: "black" | "current_visual" | "next_visual";
  intensity: number;
};

export function activeSilenceAt(timeSeconds: number, windows: SilenceWindow[]) {
  return windows.find((window) => timeSeconds >= window.startSeconds && timeSeconds < window.endSeconds);
}

export function shouldCutToBlack(timeSeconds: number, cues: VisualEditCue[]): boolean {
  return cues.some((cue) =>
    (cue.type === "cut_to_black" || cue.type === "hold_black") &&
    cue.target === "black" &&
    timeSeconds >= cue.startSeconds &&
    timeSeconds < cue.startSeconds + cue.durationSeconds
  );
}

export function activeVisualCueAt(timeSeconds: number, cues: VisualEditCue[]): VisualEditCue | undefined {
  return cues
    .filter((cue) =>
      cue.target !== "black" &&
      timeSeconds >= cue.startSeconds &&
      timeSeconds < cue.startSeconds + Math.max(0.05, cue.durationSeconds)
    )
    .sort((a, b) => {
      const aSwitch = a.target === "next_visual" ? 1 : 0;
      const bSwitch = b.target === "next_visual" ? 1 : 0;
      return bSwitch - aSwitch || b.intensity - a.intensity;
    })[0];
}

export function visualCueStyle(cue: VisualEditCue | undefined, timeSeconds: number): CSSProperties {
  if (!cue) return {};
  const duration = Math.max(0.05, cue.durationSeconds);
  const progress = Math.max(0, Math.min(1, (timeSeconds - cue.startSeconds) / duration));
  const impact = Math.max(0, Math.min(1, cue.intensity));

  if (cue.type === "push_in") {
    return {
      transform: `scale(${1 + impact * 0.08 * progress})`,
      transformOrigin: "center"
    };
  }

  if (cue.type === "slow_pan") {
    const offset = (progress - 0.5) * impact * 44;
    return {
      transform: `translateX(${offset}px) scale(${1 + impact * 0.025})`,
      transformOrigin: "center"
    };
  }

  if (cue.type === "smash_cut" || cue.type === "hard_cut" || cue.type === "match_cut") {
    const flash = Math.max(0, 1 - progress * 5) * impact;
    return {
      filter: `contrast(${1 + flash * 0.35}) brightness(${1 + flash * 0.28})`,
      transform: `scale(${1 + flash * 0.025})`,
      transformOrigin: "center"
    };
  }

  if (cue.type === "j_cut" || cue.type === "l_cut") {
    return {
      opacity: 0.92 + progress * 0.08
    };
  }

  return {};
}
