import { execFile } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VoiceProcessingOptions = {
  loudnessTargetLufs?: number;
  truePeakDb?: number;
  lra?: number;
};

export type VoiceProcessingResult = {
  loudnessTargetLufs: number;
  truePeakDb: number;
  compression: string;
};

export function tempAudioPath(audioPath: string): string {
  const extension = path.extname(audioPath) || ".wav";
  return `${audioPath}.normalized${extension}`;
}

export async function normalizeVoiceover(
  audioPath: string,
  options: VoiceProcessingOptions = {}
): Promise<VoiceProcessingResult> {
  const loudnessTargetLufs = options.loudnessTargetLufs ?? -16;
  const truePeakDb = options.truePeakDb ?? -3;
  const lra = options.lra ?? 11;
  const tempPath = tempAudioPath(audioPath);
  const compression = "light_voice";

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      audioPath,
      "-af",
      `loudnorm=I=${loudnessTargetLufs}:TP=${truePeakDb}:LRA=${lra},acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120`,
      tempPath
    ]);
    await rename(tempPath, audioPath);
  } catch (error) {
    // Keep original audio untouched if processing fails.
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return {
    loudnessTargetLufs,
    truePeakDb,
    compression
  };
}

export async function padVoiceover(
  audioPath: string,
  beforeSeconds: number,
  afterSeconds: number
): Promise<void> {
  const before = Math.max(0, beforeSeconds);
  const after = Math.max(0, afterSeconds);
  if (before <= 0 && after <= 0) return;

  const tempPath = tempAudioPath(audioPath);
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      audioPath,
      "-af",
      `adelay=${Math.round(before * 1000)}:all=1,apad=pad_dur=${after.toFixed(3)}`,
      tempPath
    ]);
    await rename(tempPath, audioPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}
