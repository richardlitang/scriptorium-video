import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProbeResult = {
  durationSeconds?: number;
  width?: number;
  height?: number;
};

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
  };
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");
  const duration = parsed.format?.duration ?? parsed.streams?.find((stream) => stream.duration)?.duration;

  return {
    durationSeconds: duration ? Number(duration) : undefined,
    width: videoStream?.width,
    height: videoStream?.height
  };
}
