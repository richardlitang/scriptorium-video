import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioApiContext } from "../lib/runtime/studio-api-context.mjs";
import { STUDIO_ROUTE_CONTEXT_KEYS } from "../lib/routes/studio-routes.mjs";

test("createStudioApiContext includes every route-required dependency key", () => {
  const dependencies = Object.fromEntries(
    STUDIO_ROUTE_CONTEXT_KEYS.map((key) => [key, Symbol(key)]),
  );
  const context = createStudioApiContext(dependencies);

  for (const key of STUDIO_ROUTE_CONTEXT_KEYS) {
    assert.ok(key in context, `missing key: ${key}`);
    assert.equal(context[key], dependencies[key]);
  }
});

test("createStudioApiContext omits unrelated dependency keys", () => {
  const dependencies = Object.fromEntries(STUDIO_ROUTE_CONTEXT_KEYS.map((key) => [key, key]));
  dependencies.unused_extra = "extra";
  const context = createStudioApiContext(dependencies);
  assert.equal("unused_extra" in context, false);
});
