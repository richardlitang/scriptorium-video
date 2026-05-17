import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";

const execFileAsync = promisify(execFile);

export class MockTTSProvider implements TTSProvider {
  id = "mock";

  async listVoices(): Promise<TTSVoice[]> {
    return [
      {
        id: "mock-neutral",
        label: "Mock Neutral",
        language: "en",
        gender: "neutral",
        supportsSpeed: true
      }
    ];
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    await mkdir(path.dirname(request.outputPath), { recursive: true });
    const words = request.text.trim().split(/\s+/).filter(Boolean).length;
    const seconds = Math.max(1.5, Math.min(20, words * 0.42));
    const frequency = 200 + (request.voiceId.length % 5) * 30;
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=${seconds.toFixed(3)}`,
      "-filter:a",
      "volume=0.12",
      request.outputPath
    ]);
    const probed = await probeMedia(request.outputPath);
    return {
      audioPath: request.outputPath,
      durationSeconds: probed.durationSeconds ?? seconds,
      providerId: this.id,
      voiceId: request.voiceId,
      inputHash: "",
      metadata: {
        words
      }
    };
  }
}
