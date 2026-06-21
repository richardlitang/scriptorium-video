import { assertStudioSubprocessCommand } from "../runtime/studio-ops.mjs";

export function createLvstudioDraftRunner(deps) {
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

  return async function runLvstudioForDraft(job, args) {
    assertStudioSubprocessCommand(args);
    if (studioTestMode) {
      if (job.cancelRequested) throw new Error("Draft job cancelled by user.");
      return runLvstudioTestModeFn()(args);
    }
    if (job.cancelRequested) throw new Error("Draft job cancelled by user.");
    const command = ["pnpm", "lvstudio", ...args].join(" ");
    const startedAt = Date.now();
    const settings = await readVoiceSettings();
    return await new Promise((resolve, reject) => {
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
              updateRunProgress(job.projectId, {
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
      child.on("error", async (error) => {
        job.currentProcessPid = undefined;
        await appendCommandLog({
          command,
          ok: false,
          durationMs: Date.now() - startedAt,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          message: String(error?.message || error),
        }).catch(() => {});
        reject(new Error(String(error?.message || error)));
      });
      child.on("close", async (code, signal) => {
        job.currentProcessPid = undefined;
        const ok = code === 0;
        const exitCode = code ?? (signal ? String(signal) : undefined);
        if (ok) {
          await appendCommandLog({
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
        await appendCommandLog({
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
