import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeProjectId, getProjectPaths } from "../dist/paths.js";

test("assertSafeProjectId accepts safe project ids", () => {
  assert.equal(assertSafeProjectId("demo"), "demo");
  assert.equal(assertSafeProjectId("the-race"), "the-race");
});

test("assertSafeProjectId rejects unsafe values", () => {
  assert.throws(() => assertSafeProjectId("../escape"), /Invalid project id/);
  assert.throws(() => assertSafeProjectId("UPPER"), /Invalid project id/);
  assert.throws(() => assertSafeProjectId("abc_def"), /Invalid project id/);
});

test("getProjectPaths rejects unsafe project ids", () => {
  assert.throws(() => getProjectPaths("../../etc"), /Invalid project id/);
});
