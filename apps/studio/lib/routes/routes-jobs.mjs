import { badRequest, dispatchRoute, parseProjectPath } from "./route-utils.mjs";
import { requireRouteContext } from "./route-context.mjs";

export const JOB_ROUTE_KEYS = [
  "sendJson",
  "parseJsonBody",
  "listDraftJobs",
  "readRunTrace",
  "activeDraftJobs",
  "jobProgress",
  "readRunState",
  "isDraftJobRunning",
  "appendRunTrace",
  "writeDraftJobState",
  "process",
  "isScaffoldPlaceholderPlan",
  "getProjectDetails",
  "runDraftJob",
  "runProjectMutation",
  "runTrackedForegroundJob",
  "domainOps",
  "appendQualityHistory",
  "writeRunState",
  "path",
  "projectsDir",
  "readFile",
  "sha256",
];

const JOB_ROUTE_CAPABILITIES = [
  "http.sendJson",
  "http.parseJsonBody",
  "jobs.listDraftJobs",
  "jobs.activeDraftJobs",
  "jobs.jobProgress",
  "jobs.isDraftJobRunning",
  "jobs.process",
  "jobs.isScaffoldPlaceholderPlan",
  "jobs.getProjectDetails",
  "jobs.runDraftJob",
  "jobs.runProjectMutation",
  "jobs.runTrackedForegroundJob",
  "jobs.path",
  "jobs.projectsDir",
  "jobs.readFile",
  "jobs.sha256",
  "traces.readRunTrace",
  "traces.readRunState",
  "traces.appendRunTrace",
  "traces.writeDraftJobState",
  "traces.appendQualityHistory",
  "traces.writeRunState",
  "domainOps.captions",
  "domainOps.generateTts",
  "domainOps.directVoice",
  "domainOps.render",
  "domainOps.sync",
  "domainOps.transcribe",
  "domainOps.check",
];

function stoppedDraftRunStateJob(job, message) {
  const now = new Date().toISOString();
  return {
    ...job,
    kind: "draft_job",
    jobId: job.jobId || job.id,
    status: "failed",
    phase: "stopped",
    label: "Draft job stopped",
    error: message,
    finishedAt: job.finishedAt || now,
    updatedAt: now,
  };
}

export async function handleJobRoutes(context, req, res, pathname, requestUrl) {
  requireRouteContext(context, "job routes", JOB_ROUTE_CAPABILITIES);
  const { sendJson, parseJsonBody } = context.http;
  const {
    listDraftJobs,
    activeDraftJobs,
    jobProgress,
    isDraftJobRunning,
    process,
    isScaffoldPlaceholderPlan,
    getProjectDetails,
    runDraftJob,
    runProjectMutation,
    runTrackedForegroundJob,
    path,
    projectsDir,
    readFile,
    sha256,
  } = context.jobs;
  const {
    readRunTrace,
    readRunState,
    appendRunTrace,
    writeDraftJobState,
    appendQualityHistory,
    writeRunState,
  } = context.traces;
  const { domainOps } = context;

  const formatOutput = (value) => JSON.stringify(value, null, 2);

  const routes = [
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "jobs" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        sendJson(res, 200, { ok: true, data: await listDraftJobs(projectId) });
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        if (!(parsed && parsed.tail.startsWith("jobs/") && parsed.tail.endsWith("/trace")))
          return null;
        return {
          projectId: parsed.projectId,
          jobId: decodeURIComponent(parsed.tail.slice("jobs/".length).replace(/\/trace$/, "")),
        };
      },
      handle: async ({ projectId, jobId }) => {
        if (!projectId || !jobId) return badRequest(res, sendJson, "Missing project id or job id.");
        sendJson(res, 200, { ok: true, data: await readRunTrace(projectId, jobId) });
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "draft-job" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        const activeJob = activeDraftJobs.get(projectId);
        if (activeJob) {
          sendJson(res, 200, { ok: true, data: jobProgress(activeJob) });
          return true;
        }
        const runState = await readRunState(projectId);
        const draftRunStateJob = (runState.jobs ?? []).find((job) => job.kind === "draft_job");
        if (!draftRunStateJob) {
          sendJson(res, 200, { ok: true, data: null });
          return true;
        }
        const staleRunning = ["queued", "running", "cancelling"].includes(draftRunStateJob.status);
        const staleMessage =
          "Studio restarted before this background job finished. Start Make Draft again to resume from generated assets.";
        const data = staleRunning
          ? stoppedDraftRunStateJob(draftRunStateJob, staleMessage)
          : draftRunStateJob;
        if (staleRunning) {
          await writeRunState(projectId, {
            ...runState,
            jobs: (runState.jobs ?? []).map((job) =>
              job.jobId === draftRunStateJob.jobId ? data : job,
            ),
          }).catch(() => {});
        }
        sendJson(res, 200, {
          ok: true,
          data,
        });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "draft-job/stop" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const activeJob = activeDraftJobs.get(projectId);
        if (!activeJob || !isDraftJobRunning(activeJob)) {
          const runState = await readRunState(projectId);
          const draftRunStateJob = (runState.jobs ?? []).find(
            (job) =>
              job.kind === "draft_job" && ["queued", "running", "cancelling"].includes(job.status),
          );
          if (draftRunStateJob) {
            const stopped = stoppedDraftRunStateJob(
              draftRunStateJob,
              "Draft job stopped from Studio. No active in-memory worker was found.",
            );
            await writeRunState(projectId, {
              ...runState,
              jobs: (runState.jobs ?? []).map((job) =>
                job.jobId === draftRunStateJob.jobId ? stopped : job,
              ),
            });
            sendJson(res, 200, {
              ok: true,
              message: "Stopped stale draft job state.",
              data: stopped,
            });
            return true;
          }
          sendJson(res, 200, { ok: true, message: "No running draft job.", data: null });
          return true;
        }
        activeJob.cancelRequested = true;
        activeJob.status = "cancelling";
        activeJob.phase = "stopping";
        activeJob.label = "Stopping draft job...";
        await appendRunTrace(projectId, activeJob.id, "draft_job.cancel_requested", {
          pid: activeJob.currentProcessPid ?? null,
        }).catch(() => {});
        await writeDraftJobState(projectId, activeJob);
        if (activeJob.currentProcessPid) {
          try {
            process.kill(activeJob.currentProcessPid, "SIGTERM");
          } catch {
            // Process may have just exited.
          }
        }
        sendJson(res, 202, {
          ok: true,
          message: "Stopping draft job.",
          data: jobProgress(activeJob),
        });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "draft-job" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const activeJob = activeDraftJobs.get(projectId);
        if (activeJob) {
          sendJson(res, 202, { ok: true, data: jobProgress(activeJob) });
          return true;
        }
        const body = await parseJsonBody(req);
        const story = String(body.story || "").trim();
        if (!story) {
          const candidatePlan =
            body.plan && typeof body.plan === "object"
              ? body.plan
              : (await getProjectDetails(projectId)).plan;
          if (isScaffoldPlaceholderPlan(candidatePlan)) {
            sendJson(res, 400, {
              ok: false,
              message:
                "Make Draft needs story text or a saved plan with real narration. The current plan still contains scaffold placeholder narration.",
            });
            return true;
          }
        }
        sendJson(res, 202, {
          ok: true,
          message: "Draft job queued.",
          data: await runDraftJob(projectId, body),
        });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "prepare-draft" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        const project = await getProjectDetails(projectId);
        const ttsProvider = project.plan.providers.tts;
        const transcriptionProvider = project.plan.providers.transcription;
        const result = await runProjectMutation(projectId, async () => {
          await writeRunState(projectId, {
            ...project.runState,
            status: "preparing",
            updatedAt: new Date().toISOString(),
          });
          const steps = await runTrackedForegroundJob(
            projectId,
            {
              kind: "prepare_draft_job",
              label: "Preparing draft",
              total: 5,
              completedLabel: "Prepare draft complete",
            },
            async ({ advance }) => [
              await advance("Generating narration", async () => ({
                stdout: formatOutput(
                  await domainOps.generateTts({ projectId, providerId: ttsProvider, force: true }),
                ),
              })),
              await advance("Syncing timeline", async () => ({
                stdout: formatOutput(await domainOps.sync(projectId)),
              })),
              await advance("Transcribing narration", async () => ({
                stdout: formatOutput(
                  await domainOps.transcribe({ projectId, providerId: transcriptionProvider }),
                ),
              })),
              await advance("Generating captions", async () => ({
                stdout: formatOutput(await domainOps.captions(projectId)),
              })),
              await advance("Running quality check", async () => {
                try {
                  return {
                    ok: true,
                    stdout: formatOutput(await domainOps.check(projectId)),
                    stderr: "",
                  };
                } catch (error) {
                  return {
                    ok: false,
                    stdout: error instanceof Error ? error.message : String(error),
                    stderr: "",
                  };
                }
              }),
            ],
          );
          const checkStdout = steps[4]?.stdout?.trim() ?? "";
          const qualityFailed = steps[4]?.ok === false;
          const checkLabel = qualityFailed ? "Quality check warnings/errors:" : "Quality check:";
          const output = [
            ...steps.map((step) => step.stdout.trim()).filter(Boolean),
            `${checkLabel}\n${checkStdout}`,
          ].join("\n\n");
          await appendQualityHistory(projectId, {
            timestamp: new Date().toISOString(),
            kind: "prepare_draft",
            summary: !qualityFailed
              ? "Draft audio, captions, sync, and quality checks completed."
              : "Draft audio, captions, and sync completed with quality check warnings/errors.",
            output,
          });
          await writeRunState(projectId, {
            ...project.runState,
            status: "prepared",
            updatedAt: new Date().toISOString(),
          });
          return { output, qualityOk: !qualityFailed };
        });
        sendJson(res, 200, { ok: true, data: result });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "direct-voice" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        const result = await runProjectMutation(projectId, async () => {
          const step = await runTrackedForegroundJob(
            projectId,
            {
              kind: "direct_voice_job",
              label: "Generating voice direction",
              total: 1,
              completedLabel: "Voice direction ready",
            },
            async ({ advance }) =>
              advance("Generating voice direction", async () => ({
                stdout: formatOutput(
                  await domainOps.directVoice({ projectId, provider: "openai" }),
                ),
              })),
          );
          await appendQualityHistory(projectId, {
            timestamp: new Date().toISOString(),
            kind: "direct_voice",
            summary: "Voice direction generated per beat.",
            output: step.stdout.trim(),
          });
          return { output: step.stdout.trim() };
        });
        sendJson(res, 200, { ok: true, data: result });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "render" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        const quality = requestUrl.searchParams.get("quality") === "final" ? "final" : "draft";
        const force = requestUrl.searchParams.get("force") === "true";
        const projectDir = path.join(projectsDir, projectId);
        const output = await runProjectMutation(projectId, async () => {
          await writeRunState(projectId, {
            ...(await readRunState(projectId)),
            status: "rendering",
            updatedAt: new Date().toISOString(),
          });
          const result = await runTrackedForegroundJob(
            projectId,
            {
              kind: "render_job",
              label: `Rendering ${quality}`,
              total: 1,
              completedLabel: `Render ${quality} complete`,
            },
            async ({ advance }) =>
              advance(`Rendering ${quality}`, () =>
                domainOps.render({ projectId, quality, force }),
              ),
          );
          const output = formatOutput(result);
          const planHash = sha256(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
          const timelineHash = sha256(
            await readFile(path.join(projectDir, "timeline.json"), "utf8").catch(() => ""),
          );
          await appendQualityHistory(projectId, {
            timestamp: new Date().toISOString(),
            kind: "render",
            summary:
              result.status === "blocked"
                ? `Render ${quality} blocked by quality checks.`
                : `Render ${quality} completed.`,
            output,
          });
          await writeRunState(projectId, {
            status: "idle",
            lastRenderPlanHash: planHash,
            lastRenderTimelineHash: timelineHash,
            lastRenderQuality: quality,
            lastRenderCompletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return output;
        });
        sendJson(res, 200, { ok: true, data: { output } });
        return true;
      },
    },
  ];

  return dispatchRoute(routes, req, pathname, context);
}
