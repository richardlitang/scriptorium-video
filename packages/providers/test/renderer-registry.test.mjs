import assert from "node:assert/strict";
import { test } from "node:test";
import { createRendererProviders, rendererProviders } from "../dist/renderer/registry.js";

test("configured Remotion renderer overrides ambient port and timeout", async () => {
  const originalPort = process.env.LVSTUDIO_REMOTION_PORT;
  const originalTimeout = process.env.LVSTUDIO_REMOTION_TIMEOUT_MS;
  process.env.LVSTUDIO_REMOTION_PORT = "invalid";
  process.env.LVSTUDIO_REMOTION_TIMEOUT_MS = "invalid";
  const selected = [];
  const rendered = [];
  try {
    const configured = createRendererProviders(
      { remotion: { port: null, timeoutInMilliseconds: 9000 } },
      {
        startAssetServerImpl: async () => ({
          baseUrl: "http://assets.test",
          close: async () => {},
        }),
        bundleImpl: async () => "http://bundle.test",
        selectCompositionImpl: async (options) => {
          selected.push(options);
          return { id: "vertical-story", width: 1080, height: 1920, fps: 30, durationInFrames: 30 };
        },
        renderMediaImpl: async (options) => {
          rendered.push(options);
        },
      },
    );

    assert.notEqual(configured, rendererProviders);
    await configured.remotion.render({
      projectDir: "/tmp",
      outputPath: "/tmp/lvstudio-configured-remotion.mp4",
      quality: "draft",
      renderBundle: {
        resolvedConfig: { templateId: "vertical-story" },
        assetManifest: { assets: [] },
        timeline: { durationSeconds: 1, width: 1080, height: 1920, fps: 30 },
      },
    });

    assert.equal(selected[0].port, null);
    assert.equal(selected[0].timeoutInMilliseconds, 9000);
    assert.equal(rendered[0].port, null);
    assert.equal(rendered[0].timeoutInMilliseconds, 9000);
  } finally {
    if (originalPort === undefined) delete process.env.LVSTUDIO_REMOTION_PORT;
    else process.env.LVSTUDIO_REMOTION_PORT = originalPort;
    if (originalTimeout === undefined) delete process.env.LVSTUDIO_REMOTION_TIMEOUT_MS;
    else process.env.LVSTUDIO_REMOTION_TIMEOUT_MS = originalTimeout;
  }
});
