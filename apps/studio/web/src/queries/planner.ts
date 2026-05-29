import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

export const plannerKeys = {
  defaults: ["planner", "defaults"] as const,
  plan: (projectId: string) => ["projects", projectId, "plan"] as const,
};

export type PlannerDefaults = {
  systemPrompt: string;
  userPromptTemplate: string;
};

export function usePlannerDefaults() {
  return useQuery({
    queryKey: plannerKeys.defaults,
    queryFn: async (): Promise<PlannerDefaults> => {
      const result = await api.planner.defaults();
      const data =
        (result as unknown as { data?: { systemPrompt?: string; userPromptTemplate?: string } })
          .data ?? {};
      return {
        systemPrompt: String(data.systemPrompt ?? ""),
        userPromptTemplate: String(data.userPromptTemplate ?? ""),
      };
    },
    staleTime: Infinity,
  });
}

export function usePlan(projectId: string | null) {
  return useQuery({
    queryKey: plannerKeys.plan(projectId ?? ""),
    queryFn: async () => {
      const result = await api.projects.plan(projectId!);
      return (result as unknown as { data?: { plan?: unknown } }).data?.plan ?? result.plan;
    },
    enabled: projectId != null,
  });
}

export function usePlanFromStory(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      story: string;
      feel: string;
      pacing: string;
      visualStyle: string;
      systemPrompt: string;
      userPromptTemplate: string;
      format: string;
    }) => api.projects.planFromStory(projectId!, body),
    onSuccess: () => {
      if (projectId) void qc.invalidateQueries({ queryKey: plannerKeys.plan(projectId) });
    },
  });
}

export function useSavePlan(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: string) => api.projects.savePlan(projectId!, plan),
    onSuccess: () => {
      if (projectId) void qc.invalidateQueries({ queryKey: plannerKeys.plan(projectId) });
    },
  });
}
