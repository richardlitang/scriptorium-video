import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { publicAssetForPath } from "../static-assets.mjs";

const publicDir = path.resolve("apps/studio/public");

test("Studio serves browser modules imported by app.js", () => {
  const checks = [
    ["/", "text/html; charset=utf-8", "index.html"],
    ["/app.js", "text/javascript; charset=utf-8", "app.js"],
    ["/styles.css", "text/css; charset=utf-8", "styles.css"],
    ["/modules/job-center.js", "text/javascript; charset=utf-8", "modules/job-center.js"],
    ["/modules/beat-workspace.js", "text/javascript; charset=utf-8", "modules/beat-workspace.js"],
    ["/modules/voice-settings-ui.js", "text/javascript; charset=utf-8", "modules/voice-settings-ui.js"],
    ["/modules/workspace.js", "text/javascript; charset=utf-8", "modules/workspace.js"]
  ];
  for (const [pathname, expectedType, expectedFile] of checks) {
    const asset = publicAssetForPath(publicDir, pathname);
    assert.ok(asset, pathname);
    assert.equal(asset.contentType, expectedType, pathname);
    assert.equal(asset.filePath, path.join(publicDir, expectedFile), pathname);
  }
});

test("Studio does not resolve paths outside the public directory", () => {
  assert.equal(publicAssetForPath(publicDir, "/../server.mjs"), undefined);
  assert.equal(publicAssetForPath(publicDir, "/modules/../../server.mjs"), undefined);
  assert.equal(publicAssetForPath(publicDir, "/modules/%2e%2e/%2e%2e/server.mjs"), undefined);
});
