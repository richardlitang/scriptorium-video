import type { TranscriptResult, TranscriptionProvider } from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";

export class MockTranscriptionProvider implements TranscriptionProvider {
  id = "mock";

  async transcribe(request: { audioPath: string; language?: string; wordTimestamps: boolean }): Promise<TranscriptResult> {
    const probed = await probeMedia(request.audioPath);
    const duration = probed.durationSeconds ?? 3;
    const text = "mock transcript";
    return {
      text,
      segments: [
        {
          startSeconds: 0,
          endSeconds: duration,
          text
        }
      ],
      words: request.wordTimestamps
        ? [
            {
              startSeconds: 0,
              endSeconds: duration,
              word: "mock",
              confidence: 1
            }
          ]
        : undefined,
      providerId: this.id
    };
  }
}
