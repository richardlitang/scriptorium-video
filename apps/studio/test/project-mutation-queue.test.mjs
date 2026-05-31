import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createProjectMutationQueue } from "../lib/project/project-mutation-queue.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

test("project mutation queue serializes operations for the same project", async () => {
  const runProjectMutation = createProjectMutationQueue();
  const first = deferred();
  const events = [];

  const firstRun = runProjectMutation("project-a", async () => {
    events.push("first:start");
    await first.promise;
    events.push("first:end");
    return "first";
  });
  const secondRun = runProjectMutation("project-a", async () => {
    events.push("second:start");
    return "second";
  });

  await setImmediate();
  assert.deepEqual(events, ["first:start"]);

  first.resolve();
  assert.equal(await firstRun, "first");
  assert.equal(await secondRun, "second");
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("project mutation queue keeps different projects independent", async () => {
  const runProjectMutation = createProjectMutationQueue();
  const first = deferred();
  const events = [];

  const firstRun = runProjectMutation("project-a", async () => {
    events.push("a:start");
    await first.promise;
    events.push("a:end");
  });
  const secondRun = runProjectMutation("project-b", async () => {
    events.push("b:start");
  });

  await secondRun;
  assert.deepEqual(events, ["a:start", "b:start"]);

  first.resolve();
  await firstRun;
  assert.deepEqual(events, ["a:start", "b:start", "a:end"]);
});

test("project mutation queue continues after a failed operation", async () => {
  const runProjectMutation = createProjectMutationQueue();
  const events = [];

  await assert.rejects(
    () =>
      runProjectMutation("project-a", async () => {
        events.push("first");
        throw new Error("failed");
      }),
    /failed/,
  );

  const result = await runProjectMutation("project-a", async () => {
    events.push("second");
    return "ok";
  });

  assert.equal(result, "ok");
  assert.deepEqual(events, ["first", "second"]);
});
