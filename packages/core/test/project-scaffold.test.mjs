import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProjectScaffold } from "../dist/project-scaffold.js";

async function withTempRoot(run) {
  const root = await mkdtemp(path.join(tmpdir(), "lvstudio-scaffold-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("createProjectScaffold writes a valid mode into the plan", async () => {
  await withTempRoot(async (root) => {
    await createProjectScaffold("demo", "short_story", "local_only", root);
    const planRaw = await readFile(
      path.join(root, "content", "projects", "demo", "video-plan.json"),
      "utf8",
    );
    const plan = JSON.parse(planRaw);
    assert.equal(plan.mode, "short_story");
    assert.equal(plan.targetPlatform, "local_only");
  });
});

test("createProjectScaffold rejects an invalid mode before writing files", async () => {
  await withTempRoot(async (root) => {
    await assert.rejects(
      () => createProjectScaffold("demo", "narrated", "local_only", root),
      /Invalid mode "narrated"\. Expected one of:/,
    );
    await assert.rejects(
      () => readFile(path.join(root, "content", "projects", "demo", "video-plan.json"), "utf8"),
      /ENOENT/,
    );
  });
});

test("createProjectScaffold rejects an invalid platform", async () => {
  await withTempRoot(async (root) => {
    await assert.rejects(
      () => createProjectScaffold("demo", "short_story", "everywhere", root),
      /Invalid platform "everywhere"\. Expected one of:/,
    );
  });
});
