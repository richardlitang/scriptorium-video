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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { message: text || "Request did not return JSON." };
  }
  if (!res.ok || !data["ok"]) {
    const parts = [
      (data["message"] as string | undefined) ?? "Request failed.",
      data["output"] ? `Output:\n${data["output"]}` : "",
      data["errors"] ? `Errors:\n${JSON.stringify(data["errors"], null, 2)}` : "",
    ].filter(Boolean);
    throw new ApiError(parts.join("\n\n"), res.status, data);
  }
  return data as T;
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

// --- Project types -------------------------------------------------------

export interface Project {
  id: string;
  title?: string;
  mode: string;
  status: string;
}

export interface ProjectsResponse {
  ok: true;
  projects: Project[];
}

export interface ProjectResponse {
  ok: true;
  project: Project;
}

export interface AssetsResponse {
  ok: true;
  assets: Asset[];
}

export interface Asset {
  id: string;
  path: string;
  type: string;
  status?: string;
  locked_by_user?: boolean;
  [key: string]: unknown;
}

export interface TtsHealthResponse {
  ok: true;
  healthy: boolean;
  model?: string;
  detail?: string;
}

export interface PlannerDefaultsResponse {
  ok: true;
  defaults: Record<string, unknown>;
}

export interface DraftJobResponse {
  ok: true;
  job?: DraftJob;
}

export interface DraftJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  progress?: number;
  [key: string]: unknown;
}

export interface JobsResponse {
  ok: true;
  jobs: JobSummary[];
}

export interface JobSummary {
  id: string;
  type: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  [key: string]: unknown;
}

export interface JobTraceResponse {
  ok: true;
  trace: unknown[];
}

export interface QualityHistoryResponse {
  ok: true;
  history: unknown[];
}

export interface RendersResponse {
  ok: true;
  renders: unknown[];
}

export interface ImageHistoryResponse {
  ok: true;
  history: unknown[];
}

export interface PlanResponse {
  ok: true;
  plan: string;
}

// --- API surface ---------------------------------------------------------

export const api = {
  projects: {
    list: () => get<ProjectsResponse>("/api/projects"),
    get: (id: string) => get<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}`),
    create: (body: { title: string; mode?: string }) =>
      post<ProjectResponse>("/api/projects", body),
    delete: (id: string) => del<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`),
    deleteAll: () => del<{ ok: true }>("/api/projects"),
    assets: (id: string) =>
      get<AssetsResponse>(`/api/projects/${encodeURIComponent(id)}/assets`),
    asset: (id: string, assetId: string) =>
      get<{ ok: true; asset: Asset }>(
        `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`,
      ),
    jobs: (id: string) =>
      get<JobsResponse>(`/api/projects/${encodeURIComponent(id)}/jobs`),
    jobTrace: (id: string, jobId: string) =>
      get<JobTraceResponse>(
        `/api/projects/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}/trace`,
      ),
    qualityHistory: (id: string) =>
      get<QualityHistoryResponse>(`/api/projects/${encodeURIComponent(id)}/quality-history`),
    renders: (id: string) =>
      get<RendersResponse>(`/api/projects/${encodeURIComponent(id)}/renders`),
    imageHistory: (id: string) =>
      get<ImageHistoryResponse>(`/api/projects/${encodeURIComponent(id)}/image-history`),
    plan: (id: string) =>
      get<PlanResponse>(`/api/projects/${encodeURIComponent(id)}/plan`),
    savePlan: (id: string, plan: string) =>
      put<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}/plan`, { plan }),
    planFromStory: (id: string, body: unknown) =>
      post<{ ok: true; plan: string }>(
        `/api/projects/${encodeURIComponent(id)}/plan-from-story`,
        body,
      ),
    draftJob: (id: string) =>
      get<DraftJobResponse>(`/api/projects/${encodeURIComponent(id)}/draft-job`),
    startDraftJob: (id: string, body: unknown) =>
      post<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}/draft-job`, body),
    stopDraftJob: (id: string) =>
      post<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}/draft-job/stop`),
    generateImages: (id: string, body?: unknown) =>
      post<{ ok: true }>(
        `/api/projects/${encodeURIComponent(id)}/generate-images`,
        body,
      ),
    directVoice: (id: string, body: unknown) =>
      post<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}/direct-voice`, body),
    render: (id: string, params?: { quality?: string; force?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.quality) qs.set("quality", params.quality);
      if (params?.force) qs.set("force", "true");
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return post<{ ok: true }>(
        `/api/projects/${encodeURIComponent(id)}/render${query}`,
      );
    },
  },
  tts: {
    health: () => get<TtsHealthResponse>("/api/tts/health"),
  },
  planner: {
    defaults: () => get<PlannerDefaultsResponse>("/api/planner-defaults"),
  },
  mediaUrl: (projectId: string, assetPath: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(assetPath)}`,
};
