export type ProjectMutation<R> = () => Promise<R>;

export type RunProjectMutation = <R>(
  projectId: string,
  operation: ProjectMutation<R>,
) => Promise<R>;

export function createProjectMutationQueue(): RunProjectMutation {
  const queues = new Map<string, Promise<unknown>>();

  async function runProjectMutation<R>(
    projectId: string,
    operation: ProjectMutation<R>,
  ): Promise<R> {
    const previous = queues.get(projectId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    queues.set(projectId, current);
    try {
      return await current;
    } finally {
      if (queues.get(projectId) === current) {
        queues.delete(projectId);
      }
    }
  }

  return runProjectMutation;
}
