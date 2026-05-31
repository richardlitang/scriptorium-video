import type { Asset } from "@lvstudio/core";
import type { DraftJob } from "@/lib/draft-job-ui-state";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Every studio success response is `{ ok: true, data?, message? }` (see
 * apps/studio/lib/routes). `request` validates the envelope and returns the
 * unwrapped `data` payload typed as `T`, so callers never re-cast.
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text || "Request did not return JSON." };
  }
  if (!res.ok || !body["ok"]) {
    const parts = [
      (body["message"] as string | undefined) ?? "Request failed.",
      body["output"] ? `Output:\n${body["output"]}` : "",
      body["errors"] ? `Errors:\n${JSON.stringify(body["errors"], null, 2)}` : "",
    ].filter(Boolean);
    throw new ApiError(parts.join("\n\n"), res.status, body);
  }
  return body["data"] as T;
}

function get<T>(url: string) {
  return request<T>(url);
}

function post<T>(url: string, body?: unknown) {
  return request<T>(url, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function put<T>(url: string, body?: unknown) {
  return request<T>(url, {
    method: "PUT",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function del<T>(url: string) {
  return request<T>(url, { method: "DELETE" });
}

// --- Response payload contracts ------------------------------------------
// These describe the server's `data` payloads. `Asset` is the canonical core
// type (one source of truth). `Project` is the server list projection — it is
// intentionally NOT core's `Project` (it carries `mode` and an optional title).

export type { Asset, DraftJob };

/** Server projection of a project in list/detail responses (not the core domain Project). */
export interface Project {
  id: string;
  title?: string;
  mode: string;
  status: string;
}

export interface DraftJobProgress {
  kind: string;
  status: string;
  jobId?: string;
  [key: string]: unknown;
}

export interface RunState {
  currentPlanHash?: string;
  currentTimelineHash?: string;
  lastRenderPlanHash?: string;
  lastRenderTimelineHash?: string;
  progress?: DraftJobProgress | null;
  [key: string]: unknown;
}

/** `data` payload of GET /api/projects/:id. The plan stays loosely typed: it is
 *  user-editable JSON that must round-trip through the editor in partial states. */
export interface ProjectDetails {
  project: Project;
  plan: Record<string, unknown>;
  timeline: Record<string, unknown> | null;
  runState: RunState;
  assetCount: number;
  captionCount: number;
}

export interface QualityEntry {
  timestamp: string;
  kind: string;
  summary: string;
}

export interface RenderEntry {
  quality: string;
  url: string;
  fileName: string;
  updatedAt?: string;
}

export interface ImageHistoryEntry {
  assetId: string;
  version: string | number;
  url?: string;
  prompt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Job {
  id: string;
  label?: string;
  status: "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled";
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  output?: string;
  error?: string;
  tracePath?: string;
  total?: number;
  completed?: number;
  currentSectionTitle?: string;
  [key: string]: unknown;
}

export interface JobTrace {
  raw?: string;
  path?: string;
  entries?: unknown[];
  [key: string]: unknown;
}

export interface TtsHealthPayload {
  ok: boolean;
  status: string;
  sampleRate: number | null;
  error: string | null;
  provider?: string;
}

export interface PlannerDefaults {
  systemPrompt: string;
  userPromptTemplate: string;
}

// --- API surface ---------------------------------------------------------

export const api = {
  projects: {
    list: () => get<{ projects: Project[] }>("/api/projects"),
    get: (id: string) => get<ProjectDetails>(`/api/projects/${encodeURIComponent(id)}`),
    create: (body: { title: string; mode?: string }) =>
      post<{ projectId: string }>("/api/projects", body),
    delete: (id: string) => del<{ projectId: string }>(`/api/projects/${encodeURIComponent(id)}`),
    deleteAll: () => del<{ deletedProjectIds: string[] }>("/api/projects"),
    assets: (id: string) =>
      get<{ assets: Asset[] }>(`/api/projects/${encodeURIComponent(id)}/assets`),
    asset: (id: string, assetId: string) =>
      get<{ asset: Asset }>(
        `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`,
      ),
    jobs: (id: string) => get<{ jobs: Job[] }>(`/api/projects/${encodeURIComponent(id)}/jobs`),
    jobTrace: (id: string, jobId: string) =>
      get<JobTrace>(
        `/api/projects/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}/trace`,
      ),
    qualityHistory: (id: string) =>
      get<{ entries: QualityEntry[] }>(`/api/projects/${encodeURIComponent(id)}/quality-history`),
    renders: (id: string) =>
      get<{ renders: RenderEntry[] }>(`/api/projects/${encodeURIComponent(id)}/renders`),
    imageHistory: (id: string) =>
      get<{ entries: ImageHistoryEntry[] }>(
        `/api/projects/${encodeURIComponent(id)}/image-history`,
      ),
    savePlan: (id: string, plan: string) =>
      put<{ output: string }>(`/api/projects/${encodeURIComponent(id)}/plan`, { plan }),
    planFromStory: (id: string, body: unknown) =>
      post<{ plan?: unknown; model?: string; warnings?: string[] }>(
        `/api/projects/${encodeURIComponent(id)}/plan-from-story`,
        body,
      ),
    draftJob: (id: string) =>
      get<DraftJob | null>(`/api/projects/${encodeURIComponent(id)}/draft-job`),
    startDraftJob: (id: string, body: unknown) =>
      post<unknown>(`/api/projects/${encodeURIComponent(id)}/draft-job`, body),
    stopDraftJob: (id: string) =>
      post<unknown>(`/api/projects/${encodeURIComponent(id)}/draft-job/stop`),
    generateImages: (id: string, body?: unknown) =>
      post<unknown>(`/api/projects/${encodeURIComponent(id)}/generate-images`, body),
    directVoice: (id: string, body: unknown) =>
      post<unknown>(`/api/projects/${encodeURIComponent(id)}/direct-voice`, body),
    render: (id: string, params?: { quality?: string; force?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.quality) qs.set("quality", params.quality);
      if (params?.force) qs.set("force", "true");
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return post<unknown>(`/api/projects/${encodeURIComponent(id)}/render${query}`);
    },
  },
  tts: {
    health: () => get<TtsHealthPayload>("/api/tts/health"),
  },
  planner: {
    defaults: () => get<PlannerDefaults>("/api/planner-defaults"),
  },
  mediaUrl: (projectId: string, assetPath: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(assetPath)}`,
};
