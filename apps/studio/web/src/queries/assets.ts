import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { projectKeys } from "./projects";

export type { ImageHistoryEntry } from "@/api/client";

export function useAssets(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.assets(projectId ?? ""),
    queryFn: async () => (await api.projects.assets(projectId!)).assets ?? [],
    enabled: projectId != null,
    staleTime: 10_000,
  });
}

export function useImageHistory(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.imageHistory(projectId ?? ""),
    queryFn: async () => (await api.projects.imageHistory(projectId!)).entries ?? [],
    enabled: projectId != null,
    staleTime: 15_000,
  });
}

export function useGenerateImages(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { mode: string; coverage: string; quality: string }) =>
      api.projects.generateImages(projectId!, body),
    onSuccess: () => {
      if (projectId) {
        void qc.invalidateQueries({ queryKey: projectKeys.assets(projectId) });
        void qc.invalidateQueries({ queryKey: projectKeys.imageHistory(projectId) });
        void qc.invalidateQueries({ queryKey: projectKeys.renders(projectId) });
      }
    },
  });
}

export function useRegenerateBeat(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      beatId,
      render,
      quality,
    }: {
      beatId: string;
      render: boolean;
      quality: string;
    }) =>
      api.projects.regenerateBeat(projectId!, beatId, {
        audio: true,
        image: true,
        captions: true,
        render,
        force: false,
        quality,
      }),
    onSuccess: () => {
      if (!projectId) return;
      for (const queryKey of [
        projectKeys.assets(projectId),
        projectKeys.detail(projectId),
        projectKeys.draftJob(projectId),
        projectKeys.renders(projectId),
      ]) {
        void qc.invalidateQueries({ queryKey });
      }
    },
  });
}
