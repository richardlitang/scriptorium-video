import { useQuery } from "@tanstack/react-query";
import { api, type Job, type JobTrace } from "@/api/client";
import { projectKeys } from "./projects";

export type { Job, JobTrace };

function isActiveJob(status: string) {
  return ["queued", "running", "cancelling"].includes(status);
}

export function useJobs(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.jobs(projectId ?? ""),
    queryFn: async () => (await api.projects.jobs(projectId!)).jobs ?? [],
    enabled: projectId != null,
    refetchInterval: (query) => {
      const jobs = query.state.data as Job[] | undefined;
      return jobs?.some((j) => isActiveJob(j.status)) ? 1000 : false;
    },
  });
}

export async function fetchJobTrace(projectId: string, job: Job): Promise<JobTrace> {
  return api.projects.jobTrace(projectId, job.id);
}
