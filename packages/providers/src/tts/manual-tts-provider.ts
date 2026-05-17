import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";

export class ManualTTSProvider implements TTSProvider {
  id = "manual";

  async listVoices(): Promise<TTSVoice[]> {
    return [
      {
        id: "manual-voice",
        label: "Manual Voice",
        language: "en"
      }
    ];
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const probed = await probeMedia(request.outputPath);
    if (!probed.durationSeconds || probed.durationSeconds <= 0) {
      throw new Error(`Manual TTS requires an existing readable audio file at ${request.outputPath}`);
    }
    return {
      audioPath: request.outputPath,
      durationSeconds: probed.durationSeconds,
      providerId: this.id,
      voiceId: request.voiceId,
      inputHash: ""
    };
  }
}
