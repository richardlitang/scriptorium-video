import type { Dirent } from "node:fs";
import type { SyncResult } from "@lvstudio/core";
import type { RunJob } from "./run-state-store.mjs";
import { formatSyncResultOutput } from "../runtime/domain-ops.mjs";

const lockableTransitions = new Set([
  "generated:locked_by_user",
  "edited:locked_by_user",
  "stale:locked_by_user",
  "locked_by_user:generated",
]);

type PathApi = {
  join: (...parts: string[]) => string;
  sep: string;
};

type ManifestAsset = {
  id: string;
  status: string;
  updatedAt?: string;
};

type AssetManifest = {
  assets: ManifestAsset[];
};

type QualityHistoryEntry = {
  timestamp: string;
  kind: string;
  summary?: string;
  output?: string;
};

type LiveJob = {
  status?: string;
};

type JobProgressEntry = {
  jobId: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  label?: string;
  output?: string;
  error?: string;
  completed?: number;
  total?: number;
  currentSectionTitle?: string;
  beatId?: string;
  tracePath?: string;
  updatedAt?: string;
};

type ProjectRecord = {
  id: string;
  title?: string;
  status?: string;
  updatedAt?: string;
};

type PlanRecord = {
  mode?: string;
  targetPlatform?: string;
};

interface ProjectOpsDeps {
  path: PathApi;
  readdir: (dirPath: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
  rm: (filePath: string, options: { recursive?: true; force?: true }) => Promise<void>;
  readFile: (filePath: string, encoding: string) => Promise<string>;
  writeFile: (filePath: string, content: string, encoding: string) => Promise<void>;
  safeReadJson: <T>(filePath: string) => Promise<T>;
  projectsDir: string;
  qualityHistoryDir: string;
  imageHistoryDir: string;
  runStatePath: (projectId: string) => string;
  syncProject: (projectId: string) => Promise<SyncResult>;
  appendQualityHistory: (projectId: string, entry: QualityHistoryEntry) => Promise<void>;
  readRunState: (projectId: string) => Promise<{ jobs?: RunJob[] }>;
  activeDraftJobs: Map<string, LiveJob>;
  activeBeatJobs: Map<string, LiveJob>;
  jobProgress: (job: LiveJob) => JobProgressEntry;
  beatJobProgress: (job: LiveJob) => JobProgressEntry;
  sha256: (value: string) => string;
}

function isJobHistory(entry: QualityHistoryEntry): boolean {
  return Boolean(entry?.kind && entry?.summary);
}

export function createProjectOps(deps: ProjectOpsDeps) {
  const {
    path,
    readdir,
    rm,
    readFile,
    writeFile,
    safeReadJson,
    projectsDir,
    qualityHistoryDir,
    imageHistoryDir,
    runStatePath,
    syncProject,
    appendQualityHistory,
    readRunState,
    activeDraftJobs,
    activeBeatJobs,
    jobProgress,
    beatJobProgress,
    sha256,
  } = deps;

  async function deleteProjectAsset(projectId: string, assetId: string) {
    const projectDir = path.join(projectsDir, projectId);
    const manifestPath = path.join(projectDir, "asset-manifest.json");
    const manifest = await safeReadJson<AssetManifest>(manifestPath);
    const before = manifest.assets.length;
    const nextAssets = manifest.assets.filter((asset) => asset.id !== assetId);
    if (nextAssets.length === before) {
      throw new Error(`Asset not found: ${assetId}`);
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify({ ...manifest, assets: nextAssets }, null, 2)}\n`,
      "utf8",
    );
    const syncResult = await syncProject(projectId);
    const syncOutput = formatSyncResultOutput(projectId, syncResult);
    await appendQualityHistory(projectId, {
      timestamp: new Date().toISOString(),
      kind: "asset_delete",
      summary: `Deleted asset ${assetId}.`,
      output: syncOutput,
    });
    return { assetId, syncOutput };
  }

  async function updateProjectAssetStatus(projectId: string, assetId: string, nextStatus: string) {
    const projectDir = path.join(projectsDir, projectId);
    const manifestPath = path.join(projectDir, "asset-manifest.json");
    const manifest = await safeReadJson<AssetManifest>(manifestPath);
    const asset = manifest.assets.find((entry) => entry.id === assetId);
    if (!asset) throw new Error(`Asset not found: ${assetId}`);
    const transition = `${asset.status}:${nextStatus}`;
    if (!lockableTransitions.has(transition)) {
      throw new Error(`Unsupported status transition ${transition}.`);
    }
    asset.status = nextStatus;
    asset.updatedAt = new Date().toISOString();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const syncResult = await syncProject(projectId);
    return { asset, syncOutput: formatSyncResultOutput(projectId, syncResult) };
  }

  async function readQualityHistory(projectId: string): Promise<QualityHistoryEntry[]> {
    const logPath = path.join(qualityHistoryDir, `${projectId}.ndjson`);
    const raw = await readFile(logPath, "utf8").catch(() => "");
    if (!raw.trim()) return [];
    return raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as QualityHistoryEntry)
      .filter(Boolean)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }

  async function listDraftJobs(projectId: string) {
    const runState = await readRunState(projectId);
    const active = activeDraftJobs.get(projectId);
    const activeBeat = activeBeatJobs.get(projectId);
    const history = (await readQualityHistory(projectId))
      .filter(isJobHistory)
      .filter((entry) => !["draft_job_failed", "draft_job_cancelled"].includes(entry.kind))
      .slice(0, 24)
      .map((entry) => ({
        id: `${entry.kind}-${sha256(`${entry.timestamp}-${entry.summary}`).slice(0, 8)}`,
        status: entry.kind.endsWith("_failed") ? "failed" : "completed",
        startedAt: entry.timestamp,
        finishedAt: entry.timestamp,
        label: entry.summary,
        output: entry.output ?? "",
        kind: entry.kind,
      }));

    const runStateJobs = (runState.jobs ?? []).slice(0, 24).map((job) => {
      let currentSectionTitle: string | undefined;
      if (typeof job.currentSectionTitle === "string") {
        currentSectionTitle = job.currentSectionTitle;
      } else if (typeof job.beatId === "string") {
        currentSectionTitle = job.beatId;
      }

      return {
        id: job.jobId,
        status: String(job.status ?? ""),
        startedAt: typeof job.startedAt === "string" ? job.startedAt : undefined,
        finishedAt: typeof job.finishedAt === "string" ? job.finishedAt : undefined,
        label: String(job.label || job.kind || ""),
        output: String(job.output ?? ""),
        kind: `${String(job.kind ?? "unknown")}_runstate`,
        error: typeof job.error === "string" ? job.error : undefined,
        completed: typeof job.completed === "number" ? job.completed : undefined,
        total: typeof job.total === "number" ? job.total : undefined,
        currentSectionTitle,
        tracePath: typeof job.tracePath === "string" ? job.tracePath : undefined,
        updatedAt: typeof job.updatedAt === "string" ? job.updatedAt : undefined,
      };
    });
    const liveJobs: Array<{
      id: string;
      status: string;
      startedAt?: string;
      finishedAt?: string;
      label?: string;
      output: string;
      kind: string;
      error?: string;
      completed?: number;
      total?: number;
      currentSectionTitle?: string;
      tracePath?: string;
      updatedAt?: string;
    }> = [];
    if (active) {
      const current = jobProgress(active);
      liveJobs.push({
        id: current.jobId,
        status: current.status,
        startedAt: current.startedAt,
        finishedAt: current.finishedAt,
        label: current.label,
        output: current.output ?? "",
        kind: "draft_job_live",
        error: current.error,
        completed: current.completed,
        total: current.total,
        currentSectionTitle: current.currentSectionTitle,
        tracePath: current.tracePath,
        updatedAt: current.updatedAt,
      });
    }
    if (activeBeat) {
      const current = beatJobProgress(activeBeat);
      liveJobs.push({
        id: current.jobId,
        status: current.status,
        startedAt: current.startedAt,
        finishedAt: current.finishedAt,
        label: current.label,
        output: current.output ?? "",
        kind: "beat_regenerate_job_live",
        error: current.error,
        completed: current.completed,
        total: current.total,
        currentSectionTitle: current.beatId,
        tracePath: current.tracePath,
        updatedAt: current.updatedAt,
      });
    }
    const jobs = [
      ...liveJobs,
      ...runStateJobs.filter((item) => !liveJobs.some((live) => live.id === item.id)),
      ...history.filter(
        (item) =>
          !liveJobs.some((live) => live.id === item.id) &&
          !runStateJobs.some((job) => job.id === item.id),
      ),
    ];
    return { jobs };
  }

  async function listProjects() {
    const entries = await readdir(projectsDir, { withFileTypes: true }).catch(() => []);
    const projects: Array<{
      id: string;
      title?: string;
      status?: string;
      mode?: string;
      targetPlatform?: string;
      updatedAt?: string;
    }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      try {
        const project = await safeReadJson<ProjectRecord>(
          path.join(projectsDir, id, "project.json"),
        );
        const plan = await safeReadJson<PlanRecord>(path.join(projectsDir, id, "video-plan.json"));
        projects.push({
          id: project.id,
          title: project.title,
          status: project.status,
          mode: plan.mode,
          targetPlatform: plan.targetPlatform,
          updatedAt: project.updatedAt,
        });
      } catch {
        // Skip invalid project folders.
      }
    }
    return projects.sort((a, b) => a.id.localeCompare(b.id));
  }

  function projectDeleteBlocker(projectId: string): string {
    const activeDraft = activeDraftJobs.get(projectId);
    if (activeDraft && ["queued", "running"].includes(activeDraft.status ?? "")) {
      return "Cannot delete project while a draft job is queued or running. Stop the job first.";
    }
    const activeBeat = activeBeatJobs.get(projectId);
    if (activeBeat && ["queued", "running"].includes(activeBeat.status ?? "")) {
      return "Cannot delete project while a beat regeneration job is queued or running. Stop the job first.";
    }
    return "";
  }

  async function deleteProject(projectId: string): Promise<void> {
    const projectDir = path.join(projectsDir, projectId);
    if (!projectDir.startsWith(projectsDir + path.sep)) throw new Error("Invalid project id.");
    await rm(projectDir, { recursive: true, force: true });
    activeDraftJobs.delete(projectId);
    activeBeatJobs.delete(projectId);
    await rm(runStatePath(projectId), { force: true }).catch(() => {});
    await rm(path.join(qualityHistoryDir, `${projectId}.ndjson`), { force: true }).catch(() => {});
    await rm(path.join(imageHistoryDir, `${projectId}.ndjson`), { force: true }).catch(() => {});
  }

  return {
    deleteProjectAsset,
    updateProjectAssetStatus,
    readQualityHistory,
    listDraftJobs,
    listProjects,
    projectDeleteBlocker,
    deleteProject,
  };
}
