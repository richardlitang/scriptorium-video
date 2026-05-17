import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProbeResult = {
  durationSeconds?: number;
  width?: number;
  height?: number;
};

function safeNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function rounded(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number(value.toFixed(3));
}

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
    durationSeconds: rounded(safeNumber(duration)),
    width: videoStream?.width && videoStream.width > 0 ? videoStream.width : undefined,
    height: videoStream?.height && videoStream.height > 0 ? videoStream.height : undefined
  };
}
