import { runRenderWorkflow } from "./render-workflow.js";

import type {
  RenderWorkflowDeps,
  RenderWorkflowInput,
  RenderWorkflowResult,
  RenderWorkflowStage,
} from "./render-workflow.js";

export type RenderJobStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

export type RenderJob = {
  jobId: string;
  kind: "render_job";
  projectId: string;
  quality: "draft" | "final";
  force: boolean;
  noSync: boolean;
  rendererProviderId?: string;
  status: RenderJobStatus;
  stage?: RenderWorkflowStage;
  label: string;
  progress?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  error?: string;
  qualityResult?: RenderWorkflowResult["quality"];
  renderResult?: Extract<RenderWorkflowResult, { status: "rendered" }>["renderResult"];
  cancelRequested: boolean;
};

export type StartRenderJobInput = {
  projectId: string;
  quality?: "draft" | "final";
  force?: boolean;
  noSync?: boolean;
  rendererProviderId?: string;
  rootDir?: string;
};

type RenderJobManagerDeps = {
  runRenderWorkflow: (
    input: RenderWorkflowInput,
    deps: Partial<RenderWorkflowDeps> & Pick<RenderWorkflowDeps, "rendererProviders">,
  ) => Promise<RenderWorkflowResult>;
  now?: () => Date;
  createJobId?: () => string;
};

const ACTIVE_JOB_STATUSES = new Set<RenderJobStatus>(["queued", "running", "cancelling"]);

function isCancellationError(error: unknown): boolean {
  return /cancelled by user/i.test(error instanceof Error ? error.message : String(error));
}

function stageLabel(stage: RenderWorkflowStage): string {
  switch (stage) {
    case "validating":
      return "Validating project";
    case "syncing":
      return "Syncing project";
    case "building_bundle":
      return "Building render bundle";
    case "checking_quality":
      return "Running quality checks";
    case "rendering":
      return "Rendering video";
    case "completed":
      return "Render completed";
  }
}

export function createRenderJobManager(deps: Partial<RenderJobManagerDeps> = {}) {
  const jobs = new Map<string, RenderJob>();
  const runWorkflow = deps.runRenderWorkflow ?? runRenderWorkflow;
  const now = deps.now ?? (() => new Date());
  const createJobId = deps.createJobId ?? (() => `render-job-${Date.now().toString(36)}`);

  const stamp = () => now().toISOString();
  const snapshot = (job: RenderJob) => ({ ...job });

  function setJob(job: RenderJob) {
    jobs.set(job.jobId, job);
  }

  function activeJobForProject(projectId: string) {
    for (const job of jobs.values()) {
      if (job.projectId === projectId && ACTIVE_JOB_STATUSES.has(job.status)) {
        return job;
      }
    }
    return null;
  }

  async function executeJob(
    job: RenderJob,
    input: StartRenderJobInput,
    workflowDeps: Partial<RenderWorkflowDeps> & Pick<RenderWorkflowDeps, "rendererProviders">,
  ) {
    if (job.cancelRequested) {
      job.status = "cancelled";
      job.label = "Render job cancelled";
      job.finishedAt = stamp();
      job.updatedAt = job.finishedAt;
      setJob(job);
      return;
    }

    job.status = "running";
    job.startedAt = stamp();
    job.updatedAt = job.startedAt;
    setJob(job);

    try {
      const result = await runWorkflow(
        {
          projectId: input.projectId,
          quality: job.quality,
          force: job.force,
          noSync: job.noSync,
          rendererProviderId: job.rendererProviderId,
          rootDir: input.rootDir,
          shouldCancel: () => job.cancelRequested,
          onStageChange: async (stage) => {
            job.stage = stage;
            job.label = stageLabel(stage);
            job.updatedAt = stamp();
            if (stage === "completed") {
              job.progress = undefined;
            }
            setJob(job);
          },
          onProgress: (progress) => {
            job.progress = progress;
            job.updatedAt = stamp();
            setJob(job);
          },
        },
        workflowDeps,
      );

      job.qualityResult = result.quality;
      if (result.status === "blocked") {
        job.status = "blocked";
        job.label = "Render blocked by quality checks";
      } else {
        job.status = job.cancelRequested ? "cancelled" : "completed";
        job.label = job.cancelRequested ? "Render job cancelled" : "Render completed";
        job.renderResult = result.renderResult;
      }
      job.finishedAt = stamp();
      job.updatedAt = job.finishedAt;
      setJob(job);
    } catch (error) {
      job.status = isCancellationError(error) ? "cancelled" : "failed";
      job.label = job.status === "cancelled" ? "Render job cancelled" : "Render failed";
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = stamp();
      job.updatedAt = job.finishedAt;
      setJob(job);
    }
  }

  function startRenderJob(
    input: StartRenderJobInput,
    workflowDeps: Partial<RenderWorkflowDeps> & Pick<RenderWorkflowDeps, "rendererProviders">,
  ) {
    const existing = activeJobForProject(input.projectId);
    if (existing) {
      throw new Error(
        `Render job ${existing.jobId} is already ${existing.status} for project ${input.projectId}.`,
      );
    }
    const createdAt = stamp();
    const job: RenderJob = {
      jobId: createJobId(),
      kind: "render_job",
      projectId: input.projectId,
      quality: input.quality === "final" ? "final" : "draft",
      force: input.force === true,
      noSync: input.noSync === true,
      rendererProviderId: input.rendererProviderId,
      status: "queued",
      label: "Queued render job",
      createdAt,
      updatedAt: createdAt,
      cancelRequested: false,
    };
    setJob(job);
    queueMicrotask(() => {
      void executeJob(job, input, workflowDeps);
    });
    return snapshot(job);
  }

  function getRenderJob(jobId: string) {
    const job = jobs.get(jobId);
    return job ? snapshot(job) : null;
  }

  function cancelRenderJob(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) return null;
    if (["completed", "blocked", "failed", "cancelled"].includes(job.status)) {
      return snapshot(job);
    }
    job.cancelRequested = true;
    job.updatedAt = stamp();
    if (job.status === "queued") {
      job.status = "cancelled";
      job.label = "Render job cancelled";
      job.finishedAt = job.updatedAt;
    } else {
      job.status = "cancelling";
      job.label = "Cancellation requested; waiting for current step to stop";
    }
    setJob(job);
    return snapshot(job);
  }

  return {
    startRenderJob,
    getRenderJob,
    cancelRenderJob,
  };
}
