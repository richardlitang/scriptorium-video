import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createStudioServerRuntime } from "../lib/runtime/studio-server-runtime-factory.mjs";
import { sendJson } from "../lib/routes/http-utils.mjs";

test("studio test loader resolves an .mjs specifier to an .mts module", () => {
  assert.equal(typeof sendJson, "function");
});

test("studio server runtime factory returns handler, port, and idempotent dispose", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-runtime-factory-"));
  try {
    const runtime = createStudioServerRuntime({
      rootDir: root,
      publicDir: path.join(root, "apps", "studio", "public"),
    });

    assert.equal(typeof runtime.port, "number");
    assert.equal(typeof runtime.handleStudioHttpRequest, "function");
    assert.equal(typeof runtime.dispose, "function");

    runtime.dispose();
    runtime.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
