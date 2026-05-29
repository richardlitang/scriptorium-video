import type { RendererProvider } from "@lvstudio/core";
import { RemotionRenderer } from "./remotion/remotion-renderer.js";

export const rendererProviders: Record<string, RendererProvider> = {
  remotion: new RemotionRenderer(),
};
