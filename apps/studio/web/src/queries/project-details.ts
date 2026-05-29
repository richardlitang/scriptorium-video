import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { projectKeys } from "./projects";

// Shape returned by GET /api/projects/:id data field
export interface ProjectDetails {
  project: { id: string; title?: string; mode: string; status: string };
  plan: Record<string, unknown>;
  timeline: Record<string, unknown> | null;
  runState: RunState;
  assetCount: number;
  captionCount: number;
}

export interface RunState {
  currentPlanHash?: string;
  currentTimelineHash?: string;
  lastRenderPlanHash?: string;
  lastRenderTimelineHash?: string;
  progress?: DraftJobProgress | null;
  [key: string]: unknown;
}

export interface DraftJobProgress {
  kind: string;
  status: string;
  jobId?: string;
  [key: string]: unknown;
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

export function useProjectDetails(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ""),
    queryFn: async (): Promise<ProjectDetails> => {
      const result = await api.projects.get(projectId!);
      return (result as unknown as { data: ProjectDetails }).data;
    },
    enabled: projectId != null,
    staleTime: 5_000,
  });
}

export function useQualityHistory(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.qualityHistory(projectId ?? ""),
    queryFn: async (): Promise<QualityEntry[]> => {
      const result = await api.projects.qualityHistory(projectId!);
      return (result as unknown as { data: { entries: QualityEntry[] } }).data.entries;
    },
    enabled: projectId != null,
    staleTime: 10_000,
  });
}

export function useRenders(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.renders(projectId ?? ""),
    queryFn: async (): Promise<RenderEntry[]> => {
      const result = await api.projects.renders(projectId!);
      return (result as unknown as { data: { renders: RenderEntry[] } }).data.renders;
    },
    enabled: projectId != null,
    staleTime: 10_000,
  });
}
