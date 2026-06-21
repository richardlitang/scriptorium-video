import assert from "node:assert/strict";
import { test } from "node:test";
import { handleStudioApiRoute } from "../lib/routes/studio-routes.mjs";
import { handleAssetRoutes } from "../lib/routes/routes-assets.mjs";
import { makeStudioBaseContext } from "./helpers/route-test-helpers.mjs";

test("studio route composition throws clear error when required dependency is missing", async () => {
  const context = makeStudioBaseContext();
  delete context.domainOps;
  await assert.rejects(
    () =>
      handleStudioApiRoute(
        context,
        { method: "GET", url: "/" },
        {},
        "/api/planner-defaults",
        new URL("http://localhost:4173"),
      ),
    /Missing dependency "domainOps" for project routes/,
  );
});

test("studio route composition handles unmatched API route with complete scoped dependencies", async () => {
  const handled = await handleStudioApiRoute(
    makeStudioBaseContext(),
    { method: "GET", url: "/" },
    {},
    "/api/unknown",
    new URL("http://localhost:4173"),
  );
  assert.equal(handled, false);
});

test("route module fails fast when required dependency key is missing", async () => {
  await assert.rejects(
    () =>
      handleAssetRoutes(
        { http: { sendJson: () => {} } },
        { method: "GET" },
        {},
        "/api/projects/demo/assets",
      ),
    /Missing capability "http\.parseJsonBody" for asset routes/,
  );
});
