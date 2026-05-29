import { badRequest, dispatchRoute, parseProjectPath } from "./route-utils.mjs";
import { requireRouteContext } from "./route-context.mjs";

export const PROJECT_QUALITY_ROUTE_KEYS = [
  "sendJson",
  "runTrackedForegroundJob",
  "runLvstudio",
  "appendQualityHistory",
  "runLvstudioReport",
  "readQualityHistory",
];

export async function handleProjectQualityRoutes(context, req, res, pathname) {
  requireRouteContext(context, "project quality routes", PROJECT_QUALITY_ROUTE_KEYS);
  const {
    sendJson,
    runTrackedForegroundJob,
    runLvstudio,
    appendQualityHistory,
    runLvstudioReport,
    readQualityHistory,
  } = context;

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
          async ({ advance }) =>
            advance("Running quality check", () => runLvstudio(["check", projectId])),
        );
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: "quality_check",
          summary: "Manual quality check run.",
          output: result.stdout.trim(),
        });
        sendJson(res, 200, { ok: true, output: result.stdout.trim() });
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
        const result = await runLvstudioReport(["review", projectId]);
        if (!result.ok) {
          sendJson(res, 200, {
            ok: true,
            data: { issues: [] },
            warning: "Review command failed. Showing empty review list.",
          });
          return true;
        }
        try {
          sendJson(res, 200, { ok: true, data: JSON.parse(result.stdout) });
        } catch {
          sendJson(res, 200, {
            ok: true,
            data: { issues: [] },
            warning: "Review output was not valid JSON. Showing empty review list.",
          });
        }
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
