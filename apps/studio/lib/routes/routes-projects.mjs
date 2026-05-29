import { handleProjectCrudRoutes, PROJECT_CRUD_ROUTE_KEYS } from "./routes-projects-crud.mjs";
import { handleProjectPlanRoutes, PROJECT_PLAN_ROUTE_KEYS } from "./routes-projects-plan.mjs";
import { handleProjectMediaRoutes, PROJECT_MEDIA_ROUTE_KEYS } from "./routes-projects-media.mjs";
import {
  handleProjectQualityRoutes,
  PROJECT_QUALITY_ROUTE_KEYS,
} from "./routes-projects-quality.mjs";

export const PROJECT_ROUTE_KEYS = Array.from(
  new Set([
    ...PROJECT_CRUD_ROUTE_KEYS,
    ...PROJECT_PLAN_ROUTE_KEYS,
    ...PROJECT_MEDIA_ROUTE_KEYS,
    ...PROJECT_QUALITY_ROUTE_KEYS,
  ]),
);

export async function handleProjectRoutes(context, req, res, pathname, requestUrl) {
  if (await handleProjectCrudRoutes(context, req, res, pathname, requestUrl)) return true;
  if (await handleProjectPlanRoutes(context, req, res, pathname, requestUrl)) return true;
  if (await handleProjectMediaRoutes(context, req, res, pathname, requestUrl)) return true;
  if (await handleProjectQualityRoutes(context, req, res, pathname, requestUrl)) return true;
  return false;
}
