import { badRequest, dispatchRoute, parseProjectPath } from "./route-utils.mjs";
import { requireRouteContext } from "./route-context.mjs";

export const ASSET_ROUTE_KEYS = [
  "sendJson",
  "parseJsonBody",
  "projectsDir",
  "path",
  "safeReadJson",
  "runProjectMutation",
  "deleteProjectAsset",
  "updateProjectAssetStatus",
  "readImageHistory",
  "generateProjectImages",
  "activeBeatJobs",
  "beatJobProgress",
  "runBeatRegenerateJob",
];

const ASSET_ROUTE_CAPABILITIES = [
  "http.sendJson",
  "http.parseJsonBody",
  "projects.projectsDir",
  "projects.path",
  "projects.safeReadJson",
  "projects.runProjectMutation",
  "projects.deleteProjectAsset",
  "projects.updateProjectAssetStatus",
  "projects.readImageHistory",
  "projects.generateProjectImages",
  "jobs.activeBeatJobs",
  "jobs.beatJobProgress",
  "jobs.runBeatRegenerateJob",
];

export async function handleAssetRoutes(context, req, res, pathname) {
  requireRouteContext(context, "asset routes", ASSET_ROUTE_CAPABILITIES);
  const { sendJson, parseJsonBody } = context.http;
  const {
    projectsDir,
    path,
    safeReadJson,
    runProjectMutation,
    deleteProjectAsset,
    updateProjectAssetStatus,
    readImageHistory,
    generateProjectImages,
  } = context.projects;
  const { activeBeatJobs, beatJobProgress, runBeatRegenerateJob } = context.jobs;

  const routes = [
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "assets" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        const manifest = await safeReadJson(
          path.join(projectsDir, projectId, "asset-manifest.json"),
        ).catch(() => ({ assets: [] }));
        sendJson(res, 200, { ok: true, data: { assets: manifest.assets ?? [] } });
        return true;
      },
    },
    {
      method: "DELETE",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        if (!(parsed && parsed.tail.startsWith("assets/"))) return null;
        return {
          projectId: parsed.projectId,
          assetId: decodeURIComponent(parsed.tail.slice("assets/".length)),
        };
      },
      handle: async ({ projectId, assetId }) => {
        if (!projectId || !assetId)
          return badRequest(res, sendJson, "Missing project id or asset id.");
        sendJson(res, 200, {
          ok: true,
          message: "Asset deleted.",
          data: await runProjectMutation(projectId, () => deleteProjectAsset(projectId, assetId)),
        });
        return true;
      },
    },
    {
      method: "PATCH",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        if (!(parsed && parsed.tail.startsWith("assets/"))) return null;
        return {
          projectId: parsed.projectId,
          assetId: decodeURIComponent(parsed.tail.slice("assets/".length)),
        };
      },
      handle: async ({ projectId, assetId }) => {
        const body = await parseJsonBody(req);
        const nextStatus = String(body.status || "");
        if (!projectId || !assetId || !nextStatus) {
          return badRequest(res, sendJson, "Missing project id, asset id, or status.");
        }
        const data = await runProjectMutation(projectId, () =>
          updateProjectAssetStatus(projectId, assetId, nextStatus),
        );
        sendJson(res, 200, { ok: true, message: "Asset status updated.", data });
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "image-history" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        sendJson(res, 200, { ok: true, data: { entries: await readImageHistory(projectId) } });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "generate-images" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const body = await parseJsonBody(req);
        const result = await runProjectMutation(projectId, () =>
          generateProjectImages(projectId, body),
        );
        sendJson(res, 200, {
          ok: true,
          message: `Generated ${result.generated.length} image asset(s).`,
          data: result,
        });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        if (!parsed) return null;
        const match = /^beats\/([^/]+)\/regenerate$/.exec(parsed.tail);
        if (!match) return null;
        return {
          projectId: parsed.projectId,
          beatId: decodeURIComponent(match[1] ?? ""),
        };
      },
      handle: async ({ projectId, beatId }) => {
        if (!projectId || !beatId)
          return badRequest(res, sendJson, "Missing project id or beat id.");
        const body = await parseJsonBody(req);
        const activeJob = activeBeatJobs.get(projectId);
        if (activeJob && ["queued", "running"].includes(activeJob.status)) {
          sendJson(res, 202, {
            ok: true,
            message: "Beat regeneration already running.",
            data: beatJobProgress(activeJob),
          });
          return true;
        }
        const result = await runBeatRegenerateJob(projectId, beatId, body);
        sendJson(res, 202, {
          ok: true,
          message: `Queued beat regeneration for ${beatId}.`,
          data: result,
        });
        return true;
      },
    },
  ];

  return dispatchRoute(routes, req, pathname, context);
}
