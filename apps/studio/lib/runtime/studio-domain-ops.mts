import { reviewProject, syncProject, type ReviewResult, type SyncResult } from "@lvstudio/core";
import { runQualityChecks, type QualityResult } from "@lvstudio/quality";

export type StudioDomainOps = {
  sync(projectId: string): Promise<SyncResult>;
  check(projectId: string): Promise<QualityResult>;
  review(projectId: string): Promise<ReviewResult>;
};

type CreateStudioDomainOpsInput = {
  rootDir: string;
  syncProjectImpl?: typeof syncProject;
  runQualityChecksImpl?: typeof runQualityChecks;
  reviewProjectImpl?: typeof reviewProject;
};

export function createStudioDomainOps({
  rootDir,
  syncProjectImpl = syncProject,
  runQualityChecksImpl = runQualityChecks,
  reviewProjectImpl = reviewProject,
}: CreateStudioDomainOpsInput): StudioDomainOps {
  return {
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
