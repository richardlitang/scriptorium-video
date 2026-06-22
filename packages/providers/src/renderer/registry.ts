import type { RendererProvider } from "@lvstudio/core";
import {
  RemotionRenderer,
  type RemotionRendererDependencies,
  type RemotionRendererOptions,
} from "./remotion/remotion-renderer.js";

export type RendererProviderOptions = {
  remotion?: RemotionRendererOptions;
};

export function createRendererProviders(
  options: RendererProviderOptions = {},
  dependencies: RemotionRendererDependencies = {},
): Record<string, RendererProvider> {
  return {
    remotion: new RemotionRenderer(options.remotion, dependencies),
  };
}

export const rendererProviders = createRendererProviders();
