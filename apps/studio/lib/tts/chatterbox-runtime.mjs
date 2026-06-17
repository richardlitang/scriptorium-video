function sleepDefault(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createChatterboxRuntime({
  readTtsHealth,
  spawnImpl,
  sleepImpl = sleepDefault,
  env = process.env,
  rootDir,
  autoStartEnabled = true,
  startCommand,
  startTimeoutMs = 45_000,
  studioTestMode = false,
} = {}) {
  if (typeof readTtsHealth !== "function")
    throw new Error("createChatterboxRuntime requires readTtsHealth.");
  if (typeof spawnImpl !== "function")
    throw new Error("createChatterboxRuntime requires spawnImpl.");
  if (!rootDir) throw new Error("createChatterboxRuntime requires rootDir.");
  if (!startCommand?.python || !startCommand?.script) {
    throw new Error(
      "createChatterboxRuntime requires startCommand.python and startCommand.script.",
    );
  }

  const startState = { pending: null };

  async function waitForChatterboxReady(timeoutMs = startTimeoutMs) {
    const deadline = Date.now() + Math.max(1000, timeoutMs);
    let last = null;
    while (Date.now() < deadline) {
      last = await readTtsHealth();
      if (last.ok) return last;
      await sleepImpl(1000);
    }
    return last ?? { provider: "chatterbox", ok: false, status: "timeout", error: "start-timeout" };
  }

  async function tryAutoStartChatterbox(reason = "draft_preflight") {
    if (!autoStartEnabled || studioTestMode)
      return { attempted: false, ready: await readTtsHealth() };
    if (startState.pending) return startState.pending;

    startState.pending = (async () => {
      const child = spawnImpl(startCommand.python, [startCommand.script], {
        cwd: rootDir,
        detached: true,
        stdio: "ignore",
        env: {
          ...env,
          CHATTERBOX_MODEL_CACHE: startCommand.modelCache,
        },
      });
      child.unref();
      const ready = await waitForChatterboxReady();
      return { attempted: true, reason, command: startCommand, ready };
    })();

    try {
      return await startState.pending;
    } finally {
      startState.pending = null;
    }
  }

  async function ensureChatterboxReady(reason = "draft_preflight") {
    const health = await readTtsHealth();
    if (health.ok) return health;
    if (!autoStartEnabled) return health;
    const recovered = await tryAutoStartChatterbox(reason);
    return recovered.ready ?? health;
  }

  function warmChatterbox(reason = "boot") {
    // Fire-and-forget autostart for server boot: kick the model load in the
    // background so /health transitions unreachable -> loading -> ready while
    // the user gets to the page, instead of showing "unreachable" until they
    // trigger a draft action. Dedups via startState.pending.
    if (!autoStartEnabled || studioTestMode) return false;
    void tryAutoStartChatterbox(reason).catch(() => {});
    return true;
  }

  function resetStartState() {
    startState.pending = null;
  }

  return {
    waitForChatterboxReady,
    tryAutoStartChatterbox,
    ensureChatterboxReady,
    warmChatterbox,
    resetStartState,
  };
}
