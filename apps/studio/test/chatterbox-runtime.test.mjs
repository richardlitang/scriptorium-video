import assert from "node:assert/strict";
import { test } from "node:test";
import { createChatterboxRuntime } from "../lib/tts/chatterbox-runtime.mjs";

test("ensureChatterboxReady returns healthy status without spawn", async () => {
  let spawned = 0;
  const runtime = createChatterboxRuntime({
    readTtsHealth: async () => ({ provider: "chatterbox", ok: true, status: "ready", error: null }),
    spawnImpl: () => {
      spawned += 1;
      return { unref() {} };
    },
    rootDir: "/repo",
    startCommand: { python: "/venv/bin/python", script: "/repo/start.py", modelCache: "/cache" },
  });

  const health = await runtime.ensureChatterboxReady();
  assert.equal(health.ok, true);
  assert.equal(spawned, 0);
});

test("ensureChatterboxReady auto-starts and waits until healthy", async () => {
  const healthStates = [
    { provider: "chatterbox", ok: false, status: "unreachable", error: "down" },
    { provider: "chatterbox", ok: false, status: "starting", error: null },
    { provider: "chatterbox", ok: true, status: "ready", error: null },
  ];
  const sleeps = [];
  const spawnCalls = [];

  const runtime = createChatterboxRuntime({
    readTtsHealth: async () =>
      healthStates.shift() ?? { provider: "chatterbox", ok: true, status: "ready", error: null },
    spawnImpl: (cmd, args, options) => {
      spawnCalls.push({ cmd, args, options });
      return { unref() {} };
    },
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
    rootDir: "/repo",
    env: { DEMO: "1" },
    startCommand: { python: "/venv/bin/python", script: "/repo/start.py", modelCache: "/cache" },
    startTimeoutMs: 3000,
  });

  const health = await runtime.ensureChatterboxReady("draft_preflight");
  assert.equal(health.ok, true);
  assert.equal(spawnCalls.length, 1);
  assert.equal(sleeps.length >= 1, true);
  assert.equal(spawnCalls[0].options.env.CHATTERBOX_MODEL_CACHE, "/cache");
});

test("ensureChatterboxReady returns degraded health when autostart is disabled", async () => {
  const runtime = createChatterboxRuntime({
    readTtsHealth: async () => ({
      provider: "chatterbox",
      ok: false,
      status: "unreachable",
      error: "down",
    }),
    spawnImpl: () => ({ unref() {} }),
    rootDir: "/repo",
    autoStartEnabled: false,
    startCommand: { python: "/venv/bin/python", script: "/repo/start.py", modelCache: "/cache" },
  });

  const health = await runtime.ensureChatterboxReady();
  assert.equal(health.ok, false);
  assert.equal(health.status, "unreachable");
});

test("warmChatterbox fire-and-forget spawns when autostart is enabled", async () => {
  const spawnCalls = [];
  const runtime = createChatterboxRuntime({
    readTtsHealth: async () => ({
      provider: "chatterbox",
      ok: false,
      status: "unreachable",
      error: "down",
    }),
    spawnImpl: (cmd, args, options) => {
      spawnCalls.push({ cmd, args, options });
      return { unref() {} };
    },
    sleepImpl: async () => {},
    rootDir: "/repo",
    startCommand: { python: "/venv/bin/python", script: "/repo/start.py", modelCache: "/cache" },
    startTimeoutMs: 1000,
  });

  const triggered = runtime.warmChatterbox("boot");
  assert.equal(triggered, true);
  // warm returns immediately; let the fire-and-forget autostart run.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(spawnCalls.length, 1);
});

test("warmChatterbox is a no-op when autostart is disabled", async () => {
  let spawned = 0;
  const runtime = createChatterboxRuntime({
    readTtsHealth: async () => ({
      provider: "chatterbox",
      ok: false,
      status: "unreachable",
      error: "down",
    }),
    spawnImpl: () => {
      spawned += 1;
      return { unref() {} };
    },
    rootDir: "/repo",
    autoStartEnabled: false,
    startCommand: { python: "/venv/bin/python", script: "/repo/start.py", modelCache: "/cache" },
  });

  assert.equal(runtime.warmChatterbox("boot"), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(spawned, 0);
});

test("resetStartState clears pending autostart state", async () => {
  let checks = 0;
  const runtime = createChatterboxRuntime({
    readTtsHealth: async () => {
      checks += 1;
      return checks > 1
        ? { provider: "chatterbox", ok: true, status: "ready", error: null }
        : { provider: "chatterbox", ok: false, status: "starting", error: null };
    },
    spawnImpl: () => ({ unref() {} }),
    sleepImpl: async () => {},
    rootDir: "/repo",
    startCommand: { python: "/venv/bin/python", script: "/repo/start.py", modelCache: "/cache" },
  });

  runtime.resetStartState();
  const health = await runtime.ensureChatterboxReady();
  assert.equal(health.ok, true);
});
