import {
  createProjectScaffold,
  generateCaptionsForProject,
  reviewProject,
  syncProject,
  type ReviewResult,
  type SyncResult,
  type TargetPlatformSchema,
  type VideoModeSchema,
} from "@lvstudio/core";
import { rendererProviders } from "@lvstudio/providers";
import { runQualityChecks, type QualityResult } from "@lvstudio/quality";
import { runRenderWorkflow, type RenderWorkflowResult } from "@lvstudio/workflows";
import type { z } from "zod";

type VideoMode = z.infer<typeof VideoModeSchema>;
type TargetPlatform = z.infer<typeof TargetPlatformSchema>;

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
};

type CreateStudioDomainOpsInput = {
  rootDir: string;
  createProjectScaffoldImpl?: typeof createProjectScaffold;
  generateCaptionsForProjectImpl?: typeof generateCaptionsForProject;
  runRenderWorkflowImpl?: typeof runRenderWorkflow;
  syncProjectImpl?: typeof syncProject;
  runQualityChecksImpl?: typeof runQualityChecks;
  reviewProjectImpl?: typeof reviewProject;
};

export function createStudioDomainOps({
  rootDir,
  createProjectScaffoldImpl = createProjectScaffold,
  generateCaptionsForProjectImpl = generateCaptionsForProject,
  runRenderWorkflowImpl = runRenderWorkflow,
  syncProjectImpl = syncProject,
  runQualityChecksImpl = runQualityChecks,
  reviewProjectImpl = reviewProject,
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
  };
}
