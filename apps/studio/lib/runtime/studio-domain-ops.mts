import {
  createProjectScaffold,
  generateTTSForProject,
  generateCaptionsForProject,
  type GenerateTTSOptions,
  reviewProject,
  syncProject,
  type ReviewResult,
  type SyncResult,
  type TargetPlatformSchema,
  type VideoModeSchema,
} from "@lvstudio/core";
import { createChatterboxTTSProvider, rendererProviders, ttsProviders } from "@lvstudio/providers";
import { runQualityChecks, type QualityResult } from "@lvstudio/quality";
import { runRenderWorkflow, type RenderWorkflowResult } from "@lvstudio/workflows";
import type { z } from "zod";
import { voiceRuntimeForSettings } from "./studio-voice-runtime.mjs";

type VideoMode = z.infer<typeof VideoModeSchema>;
type TargetPlatform = z.infer<typeof TargetPlatformSchema>;
type VoiceSettings = Parameters<typeof voiceRuntimeForSettings>[0];

export type StudioDomainOps = {
  createProject(input: {
    projectId: string;
    mode: VideoMode;
    platform: TargetPlatform;
  }): Promise<void>;
  captions(projectId: string): Promise<{ captionsPath: string; count: number }>;
  render(input: {
    projectId: string;
    quality: "draft" | "final";
    force: boolean;
  }): Promise<RenderWorkflowResult>;
  sync(projectId: string): Promise<SyncResult>;
  check(projectId: string): Promise<QualityResult>;
  review(projectId: string): Promise<ReviewResult>;
  generateTts(input: {
    projectId: string;
    providerId: string;
    force?: boolean;
    noCache?: boolean;
    onlySection?: string;
    onlyBeat?: string;
    concurrency?: number;
  }): Promise<{ generated: string[]; skipped: string[] }>;
};

type CreateStudioDomainOpsInput = {
  rootDir: string;
  createProjectScaffoldImpl?: typeof createProjectScaffold;
  generateCaptionsForProjectImpl?: typeof generateCaptionsForProject;
  runRenderWorkflowImpl?: typeof runRenderWorkflow;
  syncProjectImpl?: typeof syncProject;
  runQualityChecksImpl?: typeof runQualityChecks;
  reviewProjectImpl?: typeof reviewProject;
  generateTTSForProjectImpl?: typeof generateTTSForProject;
  readVoiceSettingsImpl?: () => Promise<VoiceSettings>;
  createChatterboxTTSProviderImpl?: typeof createChatterboxTTSProvider;
  processEnv?: NodeJS.ProcessEnv;
};

export function createStudioDomainOps({
  rootDir,
  createProjectScaffoldImpl = createProjectScaffold,
  generateCaptionsForProjectImpl = generateCaptionsForProject,
  runRenderWorkflowImpl = runRenderWorkflow,
  syncProjectImpl = syncProject,
  runQualityChecksImpl = runQualityChecks,
  reviewProjectImpl = reviewProject,
  generateTTSForProjectImpl = generateTTSForProject,
  readVoiceSettingsImpl,
  createChatterboxTTSProviderImpl = createChatterboxTTSProvider,
  processEnv = process.env,
}: CreateStudioDomainOpsInput): StudioDomainOps {
  return {
    createProject({ projectId, mode, platform }) {
      return createProjectScaffoldImpl(projectId, mode, platform, rootDir);
    },
    captions(projectId: string) {
      return generateCaptionsForProjectImpl(projectId);
    },
    render({ projectId, quality, force }) {
      return runRenderWorkflowImpl({ projectId, quality, force, rootDir }, { rendererProviders });
    },
    sync(projectId: string) {
      return syncProjectImpl(projectId, rootDir);
    },
    check(projectId: string) {
      return runQualityChecksImpl(projectId, rootDir);
    },
    review(projectId: string) {
      return reviewProjectImpl(projectId, rootDir);
    },
    async generateTts({
      projectId,
      providerId,
      force,
      noCache,
      onlySection,
      onlyBeat,
      concurrency,
    }) {
      let provider = ttsProviders[providerId];
      if (providerId === "chatterbox" && readVoiceSettingsImpl) {
        provider = createChatterboxTTSProviderImpl(
          voiceRuntimeForSettings(await readVoiceSettingsImpl(), processEnv),
        );
      }
      if (!provider) throw new Error(`Unknown TTS provider: ${providerId}`);
      const options: GenerateTTSOptions = {
        rootDir,
        ...(force === true ? { force: true } : {}),
        ...(noCache === true ? { noCache: true } : {}),
        ...(onlySection ? { onlySection } : {}),
        ...(onlyBeat ? { onlyBeat } : {}),
        ...(concurrency === undefined ? {} : { concurrency }),
      };
      return generateTTSForProjectImpl(projectId, provider, options);
    },
  };
}
