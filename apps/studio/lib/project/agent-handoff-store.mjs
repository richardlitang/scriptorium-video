import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function safeHandoffJob(job = {}) {
  return {
    kind: job.kind,
    jobId: job.jobId,
    status: job.status,
    phase: job.phase,
    label: job.label,
    completed: job.completed,
    total: job.total,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    output: String(job.output || "").slice(0, 12000),
  };
}

export function buildAgentHandoff({ projectId, job, summary, nextAction }) {
  return {
    schemaVersion: 1,
    projectId,
    generatedAt: new Date().toISOString(),
    summary,
    nextAction,
    job: safeHandoffJob(job),
  };
}

export function createAgentHandoffStore(rootDir) {
  const handoffDir = path.join(rootDir, ".studio-data", "agent-handoffs");

  function handoffPath(projectId, jobId) {
    return path.join(handoffDir, projectId, `${jobId}.json`);
  }

  async function writeAgentHandoff(projectId, job, context = {}) {
    const jobId = job?.jobId || job?.id;
    if (!jobId) throw new Error("Cannot write agent handoff without a job id.");
    const filePath = handoffPath(projectId, jobId);
    await mkdir(path.dirname(filePath), { recursive: true });
    const handoff = buildAgentHandoff({
      projectId,
      job: { ...job, jobId },
      summary: context.summary || job.label || "Workflow finished.",
      nextAction: context.nextAction,
    });
    await writeFile(filePath, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
    return { path: path.relative(rootDir, filePath), handoff };
  }

  return {
    handoffDir,
    handoffPath,
    writeAgentHandoff,
  };
}
