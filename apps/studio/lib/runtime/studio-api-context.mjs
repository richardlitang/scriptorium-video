import { createRouteCapabilities } from "../routes/route-capabilities.mjs";

export function createStudioApiContext(dependencies) {
  return createRouteCapabilities(dependencies);
}
