import assert from "node:assert/strict";
import { test } from "node:test";
import { pickRouteContext, requireRouteContext } from "../lib/routes/route-context.mjs";

test("pickRouteContext returns only requested scoped dependencies", () => {
  const context = { sendJson: () => {}, parseJsonBody: () => {}, ignored: true };
  const scoped = pickRouteContext(context, "asset routes", ["sendJson", "parseJsonBody"]);

  assert.deepEqual(Object.keys(scoped).sort(), ["parseJsonBody", "sendJson"]);
  assert.equal(scoped.sendJson, context.sendJson);
  assert.equal(scoped.parseJsonBody, context.parseJsonBody);
});

test("route context helpers report the missing dependency and module name", () => {
  assert.throws(
    () => pickRouteContext({ sendJson: () => {} }, "project routes", ["sendJson", "readFile"]),
    /Missing dependency "readFile" for project routes/,
  );
  assert.throws(
    () => requireRouteContext({ sendJson: () => {} }, "project routes", ["sendJson", "readFile"]),
    /Missing dependency "readFile" for project routes/,
  );
});
