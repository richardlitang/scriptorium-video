import type { probeMedia, TTSProvider } from "@lvstudio/core";
import { ChatterboxTTSProvider, type ChatterboxRuntimeConfig } from "./chatterbox-tts-provider.js";
import { ManualTTSProvider } from "./manual-tts-provider.js";
import { MMSTTSProvider, type MMSTTSRuntimeConfig } from "./mms-tts-provider.js";
import { MockTTSProvider } from "./mock-tts-provider.js";
import { OpenAITTSProvider, type OpenAITTSRuntimeConfig } from "./openai-tts-provider.js";

export type TTSProviderRegistryConfig = {
  chatterbox?: ChatterboxRuntimeConfig;
  mms?: MMSTTSRuntimeConfig;
  openai?: OpenAITTSRuntimeConfig;
};

export type TTSProviderRegistryDependencies = {
  fetchImpl?: typeof fetch;
  probeMediaImpl?: typeof probeMedia;
};

export function createTTSProviderRegistry(
  config: TTSProviderRegistryConfig = {},
  dependencies: TTSProviderRegistryDependencies = {},
): Record<string, TTSProvider> {
  return {
    chatterbox: new ChatterboxTTSProvider(config.chatterbox, dependencies),
    mms: new MMSTTSProvider(config.mms, dependencies),
    mock: new MockTTSProvider(),
    manual: new ManualTTSProvider(),
    openai: new OpenAITTSProvider(config.openai, dependencies),
  };
}

export const ttsProviders = createTTSProviderRegistry();
