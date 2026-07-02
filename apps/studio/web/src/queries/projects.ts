import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Project } from "@/api/client";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
  assets: (id: string) => ["projects", id, "assets"] as const,
  jobs: (id: string) => ["projects", id, "jobs"] as const,
  draftJob: (id: string) => ["projects", id, "draft-job"] as const,
  qualityHistory: (id: string) => ["projects", id, "quality-history"] as const,
  renders: (id: string) => ["projects", id, "renders"] as const,
  imageHistory: (id: string) => ["projects", id, "image-history"] as const,
  plan: (id: string) => ["projects", id, "plan"] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => api.projects.list(),
    select: (data) => data.projects,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; mode?: string }) => api.projects.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteAllProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.projects.deleteAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

// Placeholder — used by later slices
export type { Project };
