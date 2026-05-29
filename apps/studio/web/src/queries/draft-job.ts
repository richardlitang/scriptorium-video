import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { projectKeys } from "./projects";
import { isJobActive, type DraftJob } from "@/lib/draft-job-ui-state";

export const draftJobKeys = {
  current: (projectId: string) => projectKeys.draftJob(projectId),
};

export function useDraftJob(projectId: string | null) {
  const qc = useQueryClient();

  return useQuery({
    queryKey: draftJobKeys.current(projectId ?? ""),
    queryFn: async (): Promise<DraftJob | null> => {
      const result = await api.projects.draftJob(projectId!);
      return (result as unknown as { data: DraftJob | null }).data ?? null;
    },
    enabled: projectId != null,
    // Poll at 2.5s while active; stop when completed/failed
    refetchInterval: (query) => {
      const job = query.state.data as DraftJob | null | undefined;
      return isJobActive(job?.status) ? 2500 : false;
    },
    // When job finishes, refresh project details + renders
    select: (data) => {
      if (data && !isJobActive(data.status)) {
        qc.invalidateQueries({ queryKey: projectKeys.detail(projectId!) });
        qc.invalidateQueries({ queryKey: projectKeys.renders(projectId!) });
      }
      return data;
    },
  });
}

export interface DraftJobRequestBody {
  story: string;
  plan: Record<string, unknown>;
  feel: string;
  pacing: string;
  visualStyle: string;
  systemPrompt: string;
  userPromptTemplate: string;
  imageEnabled: boolean;
  imageMode: string;
  imageCoverage: string;
  imageQuality: string;
}

export function useStartDraftJob(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DraftJobRequestBody) => api.projects.startDraftJob(projectId!, body),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: draftJobKeys.current(projectId) });
      }
    },
  });
}

export function useStopDraftJob(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.projects.stopDraftJob(projectId!),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: draftJobKeys.current(projectId) });
      }
    },
  });
}
