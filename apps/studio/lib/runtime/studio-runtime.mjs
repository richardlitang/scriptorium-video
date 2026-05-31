import { createStudioApiContext } from "./studio-api-context.mjs";
import { createStudioHttpHandler } from "../routes/studio-http-handler.mjs";

export function createStudioRuntime({ contextDependencies, httpDependencies }) {
  const studioApiContext = createStudioApiContext(contextDependencies);
  const handleStudioHttpRequest = createStudioHttpHandler({
    ...httpDependencies,
    studioApiContext,
  });
  return {
    studioApiContext,
    handleStudioHttpRequest,
  };
}
