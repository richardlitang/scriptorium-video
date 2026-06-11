import {
  createProjectScaffold as coreCreateProjectScaffold,
  generateCaptionsForProject,
  syncProject as coreSyncProject,
  transcribeProject,
} from "@lvstudio/core";
import type { RendererProvider, SyncResult, TranscriptionProvider } from "@lvstudio/core";
import type { TargetPlatformSchema, VideoModeSchema } from "@lvstudio/core";
import { rendererProviders, transcriptionProviders } from "@lvstudio/providers";
import { runQualityChecks } from "@lvstudio/quality";
import type { QualityResult } from "@lvstudio/quality";
import { runRenderWorkflow } from "@lvstudio/workflows";
import type { RenderWorkflowInput, RenderWorkflowResult } from "@lvstudio/workflows";
import type { z } from "zod";

type VideoMode = z.infer<typeof VideoModeSchema>;
type TargetPlatform = z.infer<typeof TargetPlatformSchema>;

export interface DomainOpsLogEntry {
  op: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export type DomainOps = {
  syncProject: (projectId: string) => Promise<SyncResult>;
  runQualityChecks: (projectId: string) => Promise<QualityResult>;
  createProjectScaffold: (
    projectId: string,
    mode: VideoMode,
    targetPlatform: TargetPlatform,
  ) => Promise<void>;
  renderProject: (input: Omit<RenderWorkflowInput, "rootDir">) => Promise<RenderWorkflowResult>;
  generateCaptions: (projectId: string) => Promise<{ captionsPath: string; count: number }>;
  transcribeProject: (
    projectId: string,
    providerId?: string,
  ) => Promise<{ transcriptPath: string; segmentCount: number; wordCount: number }>;
};

export interface DomainOpsDeps {
  rootDir: string;
  log: (entry: DomainOpsLogEntry) => Promise<void>;
  overrides?: Partial<DomainOps>;
  rendererProviders?: Record<string, RendererProvider>;
  transcriptionProviders?: Record<string, TranscriptionProvider>;
}

function resolveTranscriptionProvider(
  providers: Record<string, TranscriptionProvider>,
  providerId?: string,
): TranscriptionProvider {
  const resolved = providers[providerId || "mock"] || providers.mock;
  if (!resolved) {
    throw new Error(`Unknown transcription provider: ${providerId || "mock"}`);
  }
  return resolved;
}

export function createDomainOps({
  rootDir,
  log,
  overrides = {},
  rendererProviders: injectedRendererProviders = rendererProviders,
  transcriptionProviders: injectedTranscriptionProviders = transcriptionProviders,
}: DomainOpsDeps): DomainOps {
  function logged<A extends unknown[], R>(op: string, fn: (...args: A) => Promise<R>) {
    return async (...args: A): Promise<R> => {
      const startedAt = Date.now();
      try {
        const result = await fn(...args);
        await log({ op, ok: true, durationMs: Date.now() - startedAt });
        return result;
      } catch (error) {
        await log({
          op,
          ok: false,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  }

  return {
    syncProject: logged(
      "syncProject",
      overrides.syncProject ?? ((projectId: string) => coreSyncProject(projectId, rootDir)),
    ),
    runQualityChecks: logged(
      "runQualityChecks",
      overrides.runQualityChecks ?? ((projectId: string) => runQualityChecks(projectId, rootDir)),
    ),
    createProjectScaffold: logged(
      "createProjectScaffold",
      overrides.createProjectScaffold ??
        ((projectId: string, mode: VideoMode, targetPlatform: TargetPlatform) =>
          coreCreateProjectScaffold(projectId, mode, targetPlatform, rootDir)),
    ),
    renderProject: logged(
      "renderProject",
      overrides.renderProject ??
        ((input: Omit<RenderWorkflowInput, "rootDir">) =>
          runRenderWorkflow(
            { ...(input as RenderWorkflowInput), rootDir },
            {
              rendererProviders: injectedRendererProviders,
            },
          )),
    ),
    generateCaptions: logged(
      "generateCaptions",
      overrides.generateCaptions ?? ((projectId: string) => generateCaptionsForProject(projectId)),
    ),
    transcribeProject: logged(
      "transcribeProject",
      overrides.transcribeProject ??
        ((projectId: string, providerId?: string) =>
          transcribeProject(
            projectId,
            resolveTranscriptionProvider(injectedTranscriptionProviders, providerId),
          )),
    ),
  };
}
