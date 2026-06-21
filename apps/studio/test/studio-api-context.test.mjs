import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioApiContext } from "../lib/runtime/studio-api-context.mjs";
import {
  HTTP_CAPABILITY_KEYS,
  JOBS_CAPABILITY_KEYS,
  PROJECTS_CAPABILITY_KEYS,
  TRACES_CAPABILITY_KEYS,
  VOICE_CAPABILITY_KEYS,
} from "../lib/routes/route-capabilities.mjs";

const dependencyKeys = Array.from(
  new Set([
    ...HTTP_CAPABILITY_KEYS,
    ...PROJECTS_CAPABILITY_KEYS,
    ...JOBS_CAPABILITY_KEYS,
    ...TRACES_CAPABILITY_KEYS,
    ...VOICE_CAPABILITY_KEYS,
  ]),
);

test("createStudioApiContext includes every named route capability", () => {
  const dependencies = Object.fromEntries(dependencyKeys.map((key) => [key, Symbol(key)]));
  dependencies.domainOps = { sync: async () => ({}) };
  const context = createStudioApiContext(dependencies);

  assert.deepEqual(Object.keys(context).sort(), [
    "domainOps",
    "http",
    "jobs",
    "projects",
    "traces",
    "voice",
  ]);
});

test("createStudioApiContext omits flat and unrelated dependency keys", () => {
  const dependencies = Object.fromEntries(dependencyKeys.map((key) => [key, key]));
  dependencies.domainOps = {};
  dependencies.unused_extra = "extra";
  const context = createStudioApiContext(dependencies);
  assert.equal("unused_extra" in context, false);
  assert.equal("sendJson" in context, false);
});

test("createStudioApiContext groups route dependencies into named capabilities", () => {
  const dependencies = Object.fromEntries(dependencyKeys.map((key) => [key, key]));
  dependencies.domainOps = {};
  const context = createStudioApiContext(dependencies);

  assert.equal(context.http.sendJson, dependencies.sendJson);
  assert.equal(context.projects.getProjectDetails, dependencies.getProjectDetails);
  assert.equal(context.jobs.runDraftJob, dependencies.runDraftJob);
  assert.equal(context.traces.readRunState, dependencies.readRunState);
  assert.equal(context.voice.readVoiceSettings, dependencies.readVoiceSettings);
  assert.equal(context.domainOps, dependencies.domainOps);
});
