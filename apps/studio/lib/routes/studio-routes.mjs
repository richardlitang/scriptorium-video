import { handleSettingsRoutes, SETTINGS_ROUTE_KEYS } from "./routes-settings.mjs";
import { handleProjectRoutes, PROJECT_ROUTE_KEYS } from "./routes-projects.mjs";
import { handleAssetRoutes, ASSET_ROUTE_KEYS } from "./routes-assets.mjs";
import { handleJobRoutes, JOB_ROUTE_KEYS } from "./routes-jobs.mjs";
import { pickRouteContext } from "./route-context.mjs";

export const SETTINGS_KEYS = SETTINGS_ROUTE_KEYS;
export const PROJECT_KEYS = PROJECT_ROUTE_KEYS;
export const ASSET_KEYS = ASSET_ROUTE_KEYS;
export const JOB_KEYS = JOB_ROUTE_KEYS;

export const STUDIO_ROUTE_CONTEXT_KEYS = Array.from(
  new Set([...SETTINGS_KEYS, ...PROJECT_KEYS, ...ASSET_KEYS, ...JOB_KEYS]),
);

export async function handleStudioApiRoute(context, req, res, pathname, requestUrl) {
  const settingsContext = pickRouteContext(context, "settings routes", SETTINGS_KEYS);
  const projectContext = pickRouteContext(context, "project routes", PROJECT_KEYS);
  const assetContext = pickRouteContext(context, "asset routes", ASSET_KEYS);
  const jobContext = pickRouteContext(context, "job routes", JOB_KEYS);

  if (await handleSettingsRoutes(settingsContext, req, res, pathname, requestUrl)) return true;
  if (await handleProjectRoutes(projectContext, req, res, pathname, requestUrl)) return true;
  if (await handleAssetRoutes(assetContext, req, res, pathname, requestUrl)) return true;
  if (await handleJobRoutes(jobContext, req, res, pathname, requestUrl)) return true;
  return false;
}
