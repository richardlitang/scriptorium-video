import { STUDIO_ROUTE_CONTEXT_KEYS } from "../routes/studio-routes.mjs";
import { createRouteCapabilities } from "../routes/route-capabilities.mjs";

export function createStudioApiContext(dependencies) {
  const context = {};
  for (const key of STUDIO_ROUTE_CONTEXT_KEYS) {
    context[key] = dependencies[key];
  }
  return { ...context, ...createRouteCapabilities(dependencies) };
}
