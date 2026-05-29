import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { projectKeys } from "./projects";

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
  [key: string]: unknown;
}

function isActiveJob(status: string) {
  return ["queued", "running", "cancelling"].includes(status);
}

export function useJobs(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.jobs(projectId ?? ""),
    queryFn: async (): Promise<Job[]> => {
      const result = await api.projects.jobs(projectId!);
      return (result as unknown as { data: { jobs: Job[] } }).data.jobs ?? [];
    },
    enabled: projectId != null,
    refetchInterval: (query) => {
      const jobs = query.state.data as Job[] | undefined;
      return jobs?.some((j) => isActiveJob(j.status)) ? 1000 : false;
    },
  });
}

export async function fetchJobTrace(projectId: string, job: Job): Promise<JobTrace> {
  const result = await api.projects.jobTrace(projectId, job.id);
  return (result as unknown as { data: JobTrace }).data;
}
