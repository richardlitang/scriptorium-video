import { badRequest, dispatchRoute, parseProjectPath } from "./route-utils.mjs";
import { requireRouteContext } from "./route-context.mjs";

export const PROJECT_QUALITY_ROUTE_KEYS = [
  "sendJson",
  "runTrackedForegroundJob",
  "domainOps",
  "appendQualityHistory",
  "readQualityHistory",
];

const PROJECT_QUALITY_ROUTE_CAPABILITIES = [
  "http.sendJson",
  "jobs.runTrackedForegroundJob",
  "traces.appendQualityHistory",
  "traces.readQualityHistory",
  "domainOps.check",
  "domainOps.review",
];

function formatOutput(value) {
  return JSON.stringify(value, null, 2);
}

export async function handleProjectQualityRoutes(context, req, res, pathname) {
  requireRouteContext(context, "project quality routes", PROJECT_QUALITY_ROUTE_CAPABILITIES);
  const { sendJson } = context.http;
  const { runTrackedForegroundJob } = context.jobs;
  const { appendQualityHistory, readQualityHistory } = context.traces;
  const { domainOps } = context;

  const routes = [
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "quality" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const result = await runTrackedForegroundJob(
          projectId,
          {
            kind: "quality_check_job",
            label: "Running quality check",
            total: 1,
            completedLabel: "Quality check complete",
          },
          async ({ advance }) => advance("Running quality check", () => domainOps.check(projectId)),
        );
        const output = formatOutput(result);
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: "quality_check",
          summary: "Manual quality check run.",
          output,
        });
        sendJson(res, 200, { ok: true, data: { output } });
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "review" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const result = await domainOps.review(projectId);
        sendJson(res, 200, { ok: true, data: result });
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "quality-history" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        const entries = await readQualityHistory(projectId);
        sendJson(res, 200, { ok: true, data: { entries } });
        return true;
      },
    },
  ];

  return dispatchRoute(routes, req, pathname, context);
}
