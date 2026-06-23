export function createStudioOpsRuntimeAdapter() {
  let runtime = null;

  function requireRuntime() {
    if (!runtime) throw new Error("Studio ops runtime is not initialized.");
    return runtime;
  }

  return {
    setRuntime(nextRuntime) {
      runtime = nextRuntime;
    },
    async appendQualityHistory(projectId, entry) {
      return requireRuntime().appendQualityHistory(projectId, entry);
    },
  };
}
