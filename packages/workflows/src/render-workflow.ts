import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildRenderBundle, getProjectPaths, syncProject, validateProject } from "@lvstudio/core";
import type { RenderBundle, RenderRequest, RenderResult, RendererProvider } from "@lvstudio/core";
import { runQualityChecksForBundle } from "@lvstudio/quality";

import type { QualityResult } from "@lvstudio/quality";

export type RenderWorkflowInput = {
  projectId: string;
  quality?: "draft" | "final";
  force?: boolean;
  noSync?: boolean;
  rendererProviderId?: string;
  rootDir?: string;
  onProgress?: RenderRequest["onProgress"];
};

export type RenderWorkflowBlockedResult = {
  status: "blocked";
  bundle: RenderBundle;
  quality: QualityResult;
};

export type RenderWorkflowRenderedResult = {
  status: "rendered";
  bundle: RenderBundle;
  quality: QualityResult;
  providerId: string;
  renderResult: RenderResult;
};

export type RenderWorkflowResult = RenderWorkflowBlockedResult | RenderWorkflowRenderedResult;

export type RenderWorkflowDeps = {
  buildRenderBundle: typeof buildRenderBundle;
  getProjectPaths: typeof getProjectPaths;
  runQualityChecksForBundle: typeof runQualityChecksForBundle;
  syncProject: typeof syncProject;
  validateProject: typeof validateProject;
  rendererProviders: Record<string, RendererProvider>;
};

type RenderWorkflowRuntimeDeps = Partial<RenderWorkflowDeps> &
  Pick<RenderWorkflowDeps, "rendererProviders">;

export async function runRenderWorkflow(
  input: RenderWorkflowInput,
  deps: RenderWorkflowRuntimeDeps,
): Promise<RenderWorkflowResult> {
  const rootDir = input.rootDir ?? process.cwd();
  const quality = input.quality === "final" ? "final" : "draft";
  const runtimeDeps: RenderWorkflowDeps = {
    buildRenderBundle,
    getProjectPaths,
    runQualityChecksForBundle,
    syncProject,
    validateProject,
    ...deps,
  };

  await runtimeDeps.validateProject(input.projectId, rootDir);
  if (!input.noSync) {
    await runtimeDeps.syncProject(input.projectId, rootDir);
  }

  const bundle = await runtimeDeps.buildRenderBundle({ projectId: input.projectId, rootDir });
  const qualityResult = await runtimeDeps.runQualityChecksForBundle(
    input.projectId,
    bundle,
    rootDir,
  );
  if (qualityResult.status === "fail" && input.force !== true) {
    return {
      status: "blocked",
      bundle,
      quality: qualityResult,
    };
  }

  const providerId = input.rendererProviderId ?? bundle.videoPlan.providers.renderer;
  const renderer = runtimeDeps.rendererProviders[providerId];
  if (!renderer) {
    throw new Error(`Unknown renderer provider: ${providerId}`);
  }

  const projectPaths = runtimeDeps.getProjectPaths(input.projectId, rootDir);
  await mkdir(projectPaths.rendersDir, { recursive: true });
  const outputPath = path.join(projectPaths.rendersDir, `${quality}.mp4`);
  const renderResult = await renderer.render({
    projectDir: projectPaths.projectDir,
    renderBundle: bundle,
    outputPath,
    quality,
    onProgress: input.onProgress,
  });

  return {
    status: "rendered",
    bundle,
    quality: qualityResult,
    providerId,
    renderResult,
  };
}
