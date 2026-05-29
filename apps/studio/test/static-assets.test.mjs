import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { publicAssetForPath, spaAssetForPath } from "../static-assets.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const studioDir = path.resolve(testDir, "..");
const webDistDir = path.join(studioDir, "web", "dist");

test("publicAssetForPath does not resolve paths outside the directory", () => {
  assert.equal(publicAssetForPath(webDistDir, "/../server.mjs"), undefined);
  assert.equal(publicAssetForPath(webDistDir, "/assets/../../server.mjs"), undefined);
  assert.equal(publicAssetForPath(webDistDir, "/assets/%2e%2e/%2e%2e/server.mjs"), undefined);
});

test("publicAssetForPath resolves known extensions inside the directory", () => {
  const js = publicAssetForPath(webDistDir, "/assets/index-abc.js");
  assert.ok(js, "should resolve .js");
  assert.equal(js.contentType, "text/javascript; charset=utf-8");
});

test("spaAssetForPath falls back to index.html for non-static-asset paths", () => {
  // SPA routes (no extension or unknown extension) → serve index.html
  const spa = spaAssetForPath(webDistDir, "/some/react/route");
  assert.ok(spa);
  assert.equal(spa.contentType, "text/html; charset=utf-8");
  assert.ok(spa.filePath.endsWith("index.html"));
});

test("spaAssetForPath resolves known static asset extensions", () => {
  const js = spaAssetForPath(webDistDir, "/assets/index-abc.js");
  assert.ok(js);
  assert.equal(js.contentType, "text/javascript; charset=utf-8");

  const css = spaAssetForPath(webDistDir, "/assets/index-abc.css");
  assert.ok(css);
  assert.equal(css.contentType, "text/css; charset=utf-8");
});

test("spaAssetForPath blocks path traversal for known static asset extensions", () => {
  // .js is a known extension — traversal attempt must be blocked
  assert.equal(spaAssetForPath(webDistDir, "/assets/%2e%2e/%2e%2e/server.js"), undefined);
  assert.equal(spaAssetForPath(webDistDir, "/../server.js"), undefined);
});
