import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export function createRunTraceStore(rootDir) {
  const runTracesDir = path.join(rootDir, ".studio-data", "run-traces");

  function runTracePath(projectId, jobId) {
    return path.join(runTracesDir, projectId, `${jobId}.ndjson`);
  }

  function runTraceDisplayPath(projectId, jobId) {
    return path.relative(rootDir, runTracePath(projectId, jobId));
  }

  async function appendRunTrace(projectId, jobId, event, data = {}) {
    const filePath = runTracePath(projectId, jobId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(
      filePath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...data })}\n`,
      "utf8",
    );
  }

  async function readRunTrace(projectId, jobId) {
    const filePath = runTracePath(projectId, jobId);
    const relative = path.relative(runTracesDir, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid trace path.");
    }
    const raw = await readFile(filePath, "utf8");
    const entries = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
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
