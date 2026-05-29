import {
  readJsonFile,
  TranscriptFileSchema,
  type TranscriptResult,
  type TranscriptionProvider,
} from "@lvstudio/core";

export class ManualTranscriptionProvider implements TranscriptionProvider {
  id = "manual";

  async transcribe(request: {
    audioPath: string;
    language?: string;
    wordTimestamps: boolean;
  }): Promise<TranscriptResult> {
    const transcript = await readJsonFile(request.audioPath, TranscriptFileSchema);
    return {
      text: transcript.text,
      segments: transcript.segments,
      words: request.wordTimestamps ? transcript.words : undefined,
      providerId: this.id,
    };
  }
}
