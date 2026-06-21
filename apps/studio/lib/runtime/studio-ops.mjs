export const STUDIO_SUBPROCESS_COMMANDS = Object.freeze([
  "generate:tts",
  "transcribe",
  "direct:voice",
]);

export function assertStudioSubprocessCommand(args) {
  const command = args[0];
  if (!STUDIO_SUBPROCESS_COMMANDS.includes(command)) {
    throw new Error(
      `Studio subprocess command not allowed: ${String(command)}. Use a typed domain operation.`,
    );
  }
}

export function createStudioOps({
  path,
  mkdir,
  appendFile,
  execFileAsync,
  readVoiceSettings,
  voiceSettingsEnv,
  runLvstudioTestMode,
  studioTestMode,
  rootDir,
  processEnv = process.env,
  qualityHistoryDir,
  commandLogPath,
}) {
  async function appendQualityHistory(projectId, entry) {
    await mkdir(qualityHistoryDir, { recursive: true });
    const logPath = path.join(qualityHistoryDir, `${projectId}.ndjson`);
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async function appendCommandLog(entry) {
    await mkdir(path.dirname(commandLogPath), { recursive: true });
    await appendFile(
      commandLogPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`,
      "utf8",
    );
  }

  async function runLvstudio(args) {
    assertStudioSubprocessCommand(args);
    if (studioTestMode) {
      return runLvstudioTestMode(args);
    }
    const command = ["pnpm", "lvstudio", ...args].join(" ");
    const startedAt = Date.now();
    try {
      const settings = await readVoiceSettings();
      const { stdout, stderr } = await execFileAsync("pnpm", ["lvstudio", ...args], {
        cwd: rootDir,
        env: { ...processEnv, ...voiceSettingsEnv(settings) },
      });
      await appendCommandLog({
        command,
        ok: true,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
      return { stdout, stderr };
    } catch (error) {
      const stdout = typeof error.stdout === "string" ? error.stdout : "";
      const stderr = typeof error.stderr === "string" ? error.stderr : "";
      const exitCode =
        typeof error.code === "number" || typeof error.code === "string" ? error.code : undefined;
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
      const message = [
        `Command failed: ${command}`,
        exitCode !== undefined ? `Exit code: ${exitCode}` : "",
        output || (error instanceof Error ? error.message : "lvstudio command failed."),
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
      });
      throw new Error(message);
    }
  }

  return {
    appendQualityHistory,
    appendCommandLog,
    runLvstudio,
  };
}
