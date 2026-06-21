import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

type RunTraceEntry = {
  timestamp: string;
  event: string;
} & Record<string, unknown>;

export function createRunTraceStore(rootDir: string) {
  const runTracesDir = path.join(rootDir, ".studio-data", "run-traces");

  function runTracePath(projectId: string, jobId: string): string {
    return path.join(runTracesDir, projectId, `${jobId}.ndjson`);
  }

  function runTraceDisplayPath(projectId: string, jobId: string): string {
    return path.relative(rootDir, runTracePath(projectId, jobId));
  }

  async function appendRunTrace(
    projectId: string,
    jobId: string,
    event: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const filePath = runTracePath(projectId, jobId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(
      filePath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...data })}\n`,
      "utf8",
    );
  }

  async function readRunTrace(
    projectId: string,
    jobId: string,
  ): Promise<{ path: string; entries: RunTraceEntry[]; raw: string }> {
    const filePath = runTracePath(projectId, jobId);
    const relative = path.relative(runTracesDir, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid trace path.");
    }
    const raw = await readFile(filePath, "utf8");
    const entries = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunTraceEntry);
    return {
      path: path.relative(rootDir, filePath),
      entries,
      raw,
    };
  }

  return {
    runTracesDir,
    runTracePath,
    runTraceDisplayPath,
    appendRunTrace,
    readRunTrace,
  };
}
