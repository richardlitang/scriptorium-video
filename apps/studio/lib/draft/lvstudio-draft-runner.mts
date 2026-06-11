type DraftJob = {
  id: string;
  projectId: string;
  phase?: string;
  cancelRequested?: boolean;
  currentProcessPid?: number;
};

type LvstudioDraftResult = {
  stdout: string;
  stderr?: string;
};

type VoiceSettings = Record<string, unknown>;

type CommandLogEntry = {
  command: string;
  ok: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode?: string | number;
  message?: string;
};

type RunProgressPatch = {
  status: string;
  progress: Record<string, unknown>;
};

type SpawnChild = {
  pid?: number;
  stdout?: {
    on: (event: "data", listener: (chunk: unknown) => void) => void;
  };
  stderr?: {
    on: (event: "data", listener: (chunk: unknown) => void) => void;
  };
  on: (
    event: "error" | "close",
    listener:
      | ((error: unknown) => void)
      | ((code: number | null, signal: NodeJS.Signals | null) => void),
  ) => void;
};

type LvstudioDraftRunnerDeps = {
  spawn: (
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ["ignore", "pipe", "pipe"] },
  ) => SpawnChild;
  rootDir: string;
  processEnv: NodeJS.ProcessEnv;
  voiceSettingsEnv: (settings: VoiceSettings) => NodeJS.ProcessEnv;
  readVoiceSettings: () => Promise<VoiceSettings>;
  appendCommandLog: (entry: CommandLogEntry) => Promise<void>;
  updateRunProgress: (projectId: string, patch: RunProgressPatch) => Promise<void>;
  renderProgressPrefix: string;
  runLvstudioTestModeFn: () => (args: string[]) => Promise<LvstudioDraftResult>;
  studioTestMode?: boolean;
};

export function createLvstudioDraftRunner(deps: LvstudioDraftRunnerDeps) {
  const {
    spawn,
    rootDir,
    processEnv,
    voiceSettingsEnv,
    readVoiceSettings,
    appendCommandLog,
    updateRunProgress,
    renderProgressPrefix,
    runLvstudioTestModeFn,
    studioTestMode,
  } = deps;

  return async function runLvstudioForDraft(
    job: DraftJob,
    args: string[],
  ): Promise<LvstudioDraftResult> {
    if (studioTestMode) {
      if (job.cancelRequested) throw new Error("Draft job cancelled by user.");
      return runLvstudioTestModeFn()(args);
    }
    if (job.cancelRequested) throw new Error("Draft job cancelled by user.");
    const command = ["pnpm", "lvstudio", ...args].join(" ");
    const startedAt = Date.now();
    const settings = await readVoiceSettings();
    return await new Promise<LvstudioDraftResult>((resolve, reject) => {
      const child = spawn("pnpm", ["lvstudio", ...args], {
        cwd: rootDir,
        env: { ...processEnv, ...voiceSettingsEnv(settings) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      job.currentProcessPid = child.pid;
      let stdout = "";
      let stderr = "";
      let stdoutLineBuffer = "";
      child.stdout?.on("data", (chunk) => {
        const text = String(chunk);
        stdout += text;
        stdoutLineBuffer += text;
        let newlineIndex = stdoutLineBuffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = stdoutLineBuffer.slice(0, newlineIndex).trim();
          stdoutLineBuffer = stdoutLineBuffer.slice(newlineIndex + 1);
          if (line.startsWith(renderProgressPrefix) && job.phase === "render") {
            const raw = line.slice(renderProgressPrefix.length);
            try {
              const payload = JSON.parse(raw);
              const renderedFrames = Number(payload.renderedFrames ?? payload.framesRendered ?? 0);
              const encodedFrames = Number(payload.encodedFrames ?? payload.framesEncoded ?? 0);
              const totalFrames = Number(payload.totalFrames ?? payload.framesTotal ?? 0);
              const fraction = Number(payload.progress ?? payload.renderedDoneInPercent ?? 0);
              const computed = totalFrames > 0 ? renderedFrames / totalFrames : fraction;
              const percent = Number.isFinite(computed)
                ? Math.max(0, Math.min(100, computed * 100))
                : 0;
              void updateRunProgress(job.projectId, {
                status: "rendering",
                progress: {
                  kind: "render",
                  jobId: job.id,
                  phase: "running",
                  renderedFrames: Number.isFinite(renderedFrames) ? renderedFrames : 0,
                  encodedFrames: Number.isFinite(encodedFrames) ? encodedFrames : 0,
                  totalFrames: Number.isFinite(totalFrames) ? totalFrames : 0,
                  percent: Number(percent.toFixed(1)),
                },
              }).catch(() => {});
            } catch {
              // Ignore malformed progress payloads.
            }
          }
          newlineIndex = stdoutLineBuffer.indexOf("\n");
        }
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error: unknown) => {
        job.currentProcessPid = undefined;
        const errorMessage = error instanceof Error ? error.message : String(error);
        void appendCommandLog({
          command,
          ok: false,
          durationMs: Date.now() - startedAt,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          message: errorMessage,
        }).catch(() => {});
        reject(new Error(errorMessage));
      });
      child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
        job.currentProcessPid = undefined;
        const ok = code === 0;
        const exitCode = code ?? (signal ? String(signal) : undefined);
        if (ok) {
          void appendCommandLog({
            command,
            ok: true,
            durationMs: Date.now() - startedAt,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          }).catch(() => {});
          resolve({ stdout, stderr });
          return;
        }
        const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
        const message = [
          `Command failed: ${command}`,
          exitCode !== undefined ? `Exit code: ${exitCode}` : "",
          output || "lvstudio command failed.",
        ]
          .filter(Boolean)
          .join("\n\n");
        void appendCommandLog({
          command,
          ok: false,
          exitCode,
          durationMs: Date.now() - startedAt,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          message,
        }).catch(() => {});
        reject(new Error(message));
      });
    });
  };
}
