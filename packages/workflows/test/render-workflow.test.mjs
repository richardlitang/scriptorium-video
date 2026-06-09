import assert from "node:assert/strict";
import { test } from "node:test";
import { runRenderWorkflow } from "../dist/index.js";

test("runRenderWorkflow validates, syncs, quality-checks, and renders the same bundle", async () => {
  const calls = [];
  const bundle = {
    videoPlan: {
      providers: {
        renderer: "default-renderer",
      },
    },
  };

  const result = await runRenderWorkflow(
    {
      projectId: "demo",
      quality: "draft",
      rendererProviderId: "override-renderer",
      rootDir: "/tmp/root",
      onProgress: () => {},
    },
    {
      validateProject: async (projectId, rootDir) => {
        calls.push(["validate", projectId, rootDir]);
        return {};
      },
      syncProject: async (projectId, rootDir) => {
        calls.push(["sync", projectId, rootDir]);
        return {};
      },
      buildRenderBundle: async ({ projectId, rootDir }) => {
        calls.push(["bundle", projectId, rootDir]);
        return bundle;
      },
      runQualityChecksForBundle: async (projectId, receivedBundle, rootDir) => {
        calls.push(["quality", projectId, receivedBundle, rootDir]);
        return { status: "warn", checks: [] };
      },
      getProjectPaths: (projectId, rootDir) => {
        calls.push(["paths", projectId, rootDir]);
        return {
          projectDir: `${rootDir}/content/projects/${projectId}`,
          rendersDir: `${rootDir}/content/projects/${projectId}/renders`,
        };
      },
      rendererProviders: {
        "override-renderer": {
          id: "override-renderer",
          capabilities: {
            supportsPreview: false,
            supportsPartialRender: false,
            supportsAlpha: false,
            supportsAudioMixing: true,
            supportedTemplates: [],
          },
          render: async ({ renderBundle, quality, outputPath, onProgress }) => {
            calls.push(["render", renderBundle, quality, outputPath, typeof onProgress]);
            return {
              outputPath,
              durationSeconds: 12,
              width: 1080,
              height: 1920,
              fps: 30,
              providerId: "override-renderer",
            };
          },
        },
      },
    },
  );

  assert.equal(result.status, "rendered");
  assert.equal(result.bundle, bundle);
  assert.equal(result.quality.status, "warn");
  assert.equal(result.providerId, "override-renderer");
  assert.equal(calls[3][2], bundle);
  assert.equal(calls[5][1], bundle);
  assert.deepEqual(
    calls.map(([step]) => step),
    ["validate", "sync", "bundle", "quality", "paths", "render"],
  );
});

test("runRenderWorkflow blocks render when quality fails without force", async () => {
  const calls = [];
  const bundle = {
    videoPlan: {
      providers: {
        renderer: "default-renderer",
      },
    },
  };

  const result = await runRenderWorkflow(
    {
      projectId: "demo",
      quality: "final",
    },
    {
      validateProject: async () => ({}),
      syncProject: async () => ({}),
      buildRenderBundle: async () => bundle,
      runQualityChecksForBundle: async () => ({
        status: "fail",
        checks: [{ id: "shared.beat.voice", severity: "error", message: "missing voice" }],
      }),
      getProjectPaths: () => {
        calls.push(["paths"]);
        return { projectDir: "/tmp/demo", rendersDir: "/tmp/demo/renders" };
      },
      rendererProviders: {
        "default-renderer": {
          id: "default-renderer",
          capabilities: {
            supportsPreview: false,
            supportsPartialRender: false,
            supportsAlpha: false,
            supportsAudioMixing: true,
            supportedTemplates: [],
          },
          render: async () => {
            calls.push(["render"]);
            return {
              outputPath: "/tmp/demo/renders/final.mp4",
              durationSeconds: 12,
              width: 1080,
              height: 1920,
              fps: 30,
              providerId: "default-renderer",
            };
          },
        },
      },
    },
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.bundle, bundle);
  assert.equal(result.quality.status, "fail");
  assert.deepEqual(calls, []);
});
