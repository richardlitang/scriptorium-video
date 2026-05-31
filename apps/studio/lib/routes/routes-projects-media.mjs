import { dispatchRoute, mediaMimeForPath, parseProjectPath } from "./route-utils.mjs";
import { requireRouteContext } from "./route-context.mjs";

export const PROJECT_MEDIA_ROUTE_KEYS = [
  "sendJson",
  "projectsDir",
  "path",
  "getRenderDetails",
  "sendVideoFile",
  "safeProjectPath",
  "readFile",
];

export async function handleProjectMediaRoutes(context, req, res, pathname) {
  requireRouteContext(context, "project media routes", PROJECT_MEDIA_ROUTE_KEYS);
  const {
    sendJson,
    projectsDir,
    path,
    getRenderDetails,
    sendVideoFile,
    safeProjectPath,
    readFile,
  } = context;

  const routes = [
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "renders" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        sendJson(res, 200, { ok: true, data: await getRenderDetails(projectId) });
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail.startsWith("renders/")
          ? {
              projectId: parsed.projectId,
              quality: decodeURIComponent(parsed.tail.slice("renders/".length)),
            }
          : null;
      },
      handle: async ({ projectId, quality }) => {
        if (!["draft", "final"].includes(quality)) {
          sendJson(res, 400, { ok: false, message: "Invalid render quality." });
          return true;
        }
        const renderPath = path.join(projectsDir, projectId, "renders", `${quality}.mp4`);
        await sendVideoFile(req, res, renderPath, "video/mp4");
        return true;
      },
    },
    {
      method: "HEAD",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail.startsWith("renders/")
          ? {
              projectId: parsed.projectId,
              quality: decodeURIComponent(parsed.tail.slice("renders/".length)),
            }
          : null;
      },
      handle: async ({ projectId, quality }) => {
        if (!["draft", "final"].includes(quality)) {
          sendJson(res, 400, { ok: false, message: "Invalid render quality." });
          return true;
        }
        const renderPath = path.join(projectsDir, projectId, "renders", `${quality}.mp4`);
        await sendVideoFile(req, res, renderPath, "video/mp4");
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail.startsWith("media/")
          ? {
              projectId: parsed.projectId,
              relativeAssetPath: decodeURIComponent(parsed.tail.slice("media/".length)),
            }
          : null;
      },
      handle: async ({ projectId, relativeAssetPath }) => {
        const mediaPath = safeProjectPath(projectId, relativeAssetPath);
        if (!mediaPath) {
          sendJson(res, 400, { ok: false, message: "Invalid media path." });
          return true;
        }
        const content = await readFile(mediaPath).catch(() => null);
        if (!content) {
          sendJson(res, 404, { ok: false, message: "Media not found." });
          return true;
        }
        const mime = mediaMimeForPath(path, mediaPath);
        res.writeHead(200, { "content-type": mime });
        res.end(content);
        return true;
      },
    },
  ];

  return dispatchRoute(routes, req, pathname, context);
}
