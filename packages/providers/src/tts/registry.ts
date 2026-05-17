import type { TTSProvider } from "@lvstudio/core";
import { ManualTTSProvider } from "./manual-tts-provider.js";
import { MockTTSProvider } from "./mock-tts-provider.js";

export const ttsProviders: Record<string, TTSProvider> = {
  mock: new MockTTSProvider(),
  manual: new ManualTTSProvider()
};
