import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useProjectReview(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId ?? "", "review"],
    queryFn: async () => (await api.projects.review(projectId!)).issues,
    enabled: projectId != null,
    staleTime: 30_000,
  });
}
