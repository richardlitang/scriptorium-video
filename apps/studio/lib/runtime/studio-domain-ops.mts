import {
  createProjectScaffold,
  directVoiceProject,
  generateTTSForProject,
  generateCaptionsForProject,
  type GenerateTTSOptions,
  type DirectVoiceProjectResult,
  type RendererProvider,
  type TTSProvider,
  type TranscriptionProvider,
  reviewProject,
  syncProject,
  transcribeProject,
  type ReviewResult,
  type SyncResult,
  type TargetPlatformSchema,
  type VideoModeSchema,
} from "@lvstudio/core";
import {
  createChatterboxTTSProvider,
  rendererProviders as defaultRendererProviders,
  transcriptionProviders as defaultTranscriptionProviders,
  ttsProviders as defaultTtsProviders,
} from "@lvstudio/providers";
import { runQualityChecks, type QualityResult } from "@lvstudio/quality";
import { runRenderWorkflow, type RenderWorkflowResult } from "@lvstudio/workflows";
import type { z } from "zod";
import { voiceRuntimeForSettings } from "./studio-voice-runtime.mjs";
import { resolveVoiceReferencePath } from "../tts/voice-reference-path.mjs";

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
  transcribe(input: {
    projectId: string;
    providerId: string;
  }): Promise<{ transcriptPath: string; segmentCount: number; wordCount: number }>;
  directVoice(input: {
    projectId: string;
    provider?: string;
    force?: boolean;
  }): Promise<DirectVoiceProjectResult>;
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
  transcribeProjectImpl?: typeof transcribeProject;
  directVoiceProjectImpl?: typeof directVoiceProject;
  readVoiceSettingsImpl?: () => Promise<VoiceSettings>;
  createChatterboxTTSProviderImpl?: typeof createChatterboxTTSProvider;
  processEnv?: NodeJS.ProcessEnv;
  ttsProviderRegistry?: Readonly<Record<string, TTSProvider>>;
  transcriptionProviderRegistry?: Readonly<Record<string, TranscriptionProvider>>;
  rendererProviderRegistry?: Readonly<Record<string, RendererProvider>>;
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
  transcribeProjectImpl = transcribeProject,
  directVoiceProjectImpl = directVoiceProject,
  readVoiceSettingsImpl,
  createChatterboxTTSProviderImpl = createChatterboxTTSProvider,
  processEnv = process.env,
  ttsProviderRegistry = defaultTtsProviders,
  transcriptionProviderRegistry = defaultTranscriptionProviders,
  rendererProviderRegistry = defaultRendererProviders,
}: CreateStudioDomainOpsInput): StudioDomainOps {
  return {
    createProject({ projectId, mode, platform }) {
      return createProjectScaffoldImpl(projectId, mode, platform, rootDir);
    },
    captions(projectId: string) {
      return generateCaptionsForProjectImpl(projectId);
    },
    render({ projectId, quality, force }) {
      return runRenderWorkflowImpl(
        { projectId, quality, force, rootDir },
        { rendererProviders: rendererProviderRegistry },
      );
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
      let provider = ttsProviderRegistry[providerId];
      if (providerId === "chatterbox" && readVoiceSettingsImpl) {
        const settings = await readVoiceSettingsImpl();
        const audioPromptPath = resolveVoiceReferencePath(settings.audioPromptPath, rootDir);
        provider = createChatterboxTTSProviderImpl(
          voiceRuntimeForSettings(
            { ...settings, audioPromptPath: audioPromptPath ?? "" },
            processEnv,
          ),
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
    async transcribe({ projectId, providerId }) {
      const provider = transcriptionProviderRegistry[providerId];
      if (!provider) throw new Error(`Unknown transcription provider: ${providerId}`);
      return transcribeProjectImpl(projectId, provider, rootDir);
    },
    directVoice({ projectId, provider = "openai", force }) {
      return directVoiceProjectImpl(projectId, {
        rootDir,
        provider,
        ...(force === undefined ? {} : { force }),
      });
    },
  };
}
