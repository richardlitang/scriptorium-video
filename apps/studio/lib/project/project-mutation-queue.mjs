export function createProjectMutationQueue() {
  const queues = new Map();

  async function runProjectMutation(projectId, operation) {
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
