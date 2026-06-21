type ProjectMutation<T> = () => Promise<T> | T;

export function createProjectMutationQueue() {
  const queues = new Map<string, Promise<unknown>>();

  async function runProjectMutation<T>(
    projectId: string,
    operation: ProjectMutation<T>,
  ): Promise<T> {
    const previous = queues.get(projectId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
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
