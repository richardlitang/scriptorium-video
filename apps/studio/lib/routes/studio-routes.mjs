import { handleSettingsRoutes } from "./routes-settings.mjs";
import { handleProjectRoutes } from "./routes-projects.mjs";
import { handleAssetRoutes } from "./routes-assets.mjs";
import { handleJobRoutes } from "./routes-jobs.mjs";
import { pickRouteContext } from "./route-context.mjs";

export async function handleStudioApiRoute(context, req, res, pathname, requestUrl) {
  const settingsContext = pickRouteContext(context, "settings routes", ["http", "voice"]);
  const projectContext = pickRouteContext(context, "project routes", [
    "http",
    "projects",
    "jobs",
    "traces",
    "domainOps",
  ]);
  const assetContext = pickRouteContext(context, "asset routes", ["http", "projects", "jobs"]);
  const jobContext = pickRouteContext(context, "job routes", [
    "http",
    "jobs",
    "traces",
    "domainOps",
  ]);

  if (await handleSettingsRoutes(settingsContext, req, res, pathname, requestUrl)) return true;
  if (await handleProjectRoutes(projectContext, req, res, pathname, requestUrl)) return true;
  if (await handleAssetRoutes(assetContext, req, res, pathname, requestUrl)) return true;
  if (await handleJobRoutes(jobContext, req, res, pathname, requestUrl)) return true;
  return false;
}
