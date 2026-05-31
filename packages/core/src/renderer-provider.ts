import type { AssetManifest } from "./schemas/asset-manifest.schema.js";
import type { CaptionsFile } from "./schemas/captions.schema.js";
import type { Project } from "./schemas/project.schema.js";
import type { Timeline } from "./schemas/timeline.schema.js";
import type { VideoPlan } from "./schemas/video-plan.schema.js";

export type RendererCapabilities = {
  supportsPreview: boolean;
  supportsPartialRender: boolean;
  supportsAlpha: boolean;
  supportsAudioMixing: boolean;
  supportedTemplates: string[];
};

export type ResolvedRenderConfig = {
  fps: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: {
    width: number;
    height: number;
  };
  templateId: string;
  targetDurationSeconds?: number;
};

export type RenderBundle = {
  project: Project;
  videoPlan: VideoPlan;
  assetManifest: AssetManifest;
  timeline: Timeline;
  captions?: CaptionsFile;
  resolvedConfig: ResolvedRenderConfig;
};

export type RenderRequest = {
  projectDir: string;
  renderBundle: RenderBundle;
  outputPath: string;
  quality: "draft" | "final";
  onProgress?: (progress: Record<string, unknown>) => void;
};

export type RenderResult = {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  providerId: string;
};

export interface RendererProvider {
  id: string;
  capabilities: RendererCapabilities;
  render(request: RenderRequest): Promise<RenderResult>;
}
