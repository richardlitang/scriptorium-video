import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { projectKeys } from "./projects";

// Response contracts live in the API client (single source). Re-export the
// ones consumers of this module already import by name.
export type {
  ProjectDetails,
  RunState,
  DraftJobProgress,
  QualityEntry,
  RenderEntry,
} from "@/api/client";

export function useProjectDetails(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ""),
    queryFn: () => api.projects.get(projectId!),
    enabled: projectId != null,
    staleTime: 5_000,
  });
}

export function useQualityHistory(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.qualityHistory(projectId ?? ""),
    queryFn: async () => (await api.projects.qualityHistory(projectId!)).entries,
    enabled: projectId != null,
    staleTime: 10_000,
  });
}

export function useRenders(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.renders(projectId ?? ""),
    queryFn: async () => (await api.projects.renders(projectId!)).renders,
    enabled: projectId != null,
    staleTime: 10_000,
  });
}
