import {
  createProjectScaffold,
  reviewProject,
  syncProject,
  type ReviewResult,
  type SyncResult,
  type TargetPlatformSchema,
  type VideoModeSchema,
} from "@lvstudio/core";
import { runQualityChecks, type QualityResult } from "@lvstudio/quality";
import type { z } from "zod";

type VideoMode = z.infer<typeof VideoModeSchema>;
type TargetPlatform = z.infer<typeof TargetPlatformSchema>;

export type StudioDomainOps = {
  createProject(input: {
    projectId: string;
    mode: VideoMode;
    platform: TargetPlatform;
  }): Promise<void>;
  sync(projectId: string): Promise<SyncResult>;
  check(projectId: string): Promise<QualityResult>;
  review(projectId: string): Promise<ReviewResult>;
};

type CreateStudioDomainOpsInput = {
  rootDir: string;
  createProjectScaffoldImpl?: typeof createProjectScaffold;
  syncProjectImpl?: typeof syncProject;
  runQualityChecksImpl?: typeof runQualityChecks;
  reviewProjectImpl?: typeof reviewProject;
};

export function createStudioDomainOps({
  rootDir,
  createProjectScaffoldImpl = createProjectScaffold,
  syncProjectImpl = syncProject,
  runQualityChecksImpl = runQualityChecks,
  reviewProjectImpl = reviewProject,
}: CreateStudioDomainOpsInput): StudioDomainOps {
  return {
    createProject({ projectId, mode, platform }) {
      return createProjectScaffoldImpl(projectId, mode, platform, rootDir);
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
