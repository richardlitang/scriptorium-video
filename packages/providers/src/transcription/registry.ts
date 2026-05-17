import type { TranscriptionProvider } from "@lvstudio/core";
import { ManualTranscriptionProvider } from "./manual-transcription-provider.js";
import { MockTranscriptionProvider } from "./mock-transcription-provider.js";

export const transcriptionProviders: Record<string, TranscriptionProvider> = {
  mock: new MockTranscriptionProvider(),
  manual: new ManualTranscriptionProvider()
};
