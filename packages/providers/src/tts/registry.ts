import type { TTSProvider } from "@lvstudio/core";
import { ChatterboxTTSProvider } from "./chatterbox-tts-provider.js";
import { ManualTTSProvider } from "./manual-tts-provider.js";
import { MMSTTSProvider } from "./mms-tts-provider.js";
import { MockTTSProvider } from "./mock-tts-provider.js";
import { OpenAITTSProvider } from "./openai-tts-provider.js";

export const ttsProviders: Record<string, TTSProvider> = {
  chatterbox: new ChatterboxTTSProvider(),
  mms: new MMSTTSProvider(),
  mock: new MockTTSProvider(),
  manual: new ManualTTSProvider(),
  openai: new OpenAITTSProvider()
};
