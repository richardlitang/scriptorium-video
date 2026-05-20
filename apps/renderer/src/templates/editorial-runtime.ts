export type SilenceWindow = {
  startSeconds: number;
  endSeconds: number;
  muteMusic: boolean;
  muteSfx: boolean;
  keepVoice: boolean;
};

export type VisualEditCue = {
  type: string;
  startSeconds: number;
  durationSeconds: number;
  target: string;
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
