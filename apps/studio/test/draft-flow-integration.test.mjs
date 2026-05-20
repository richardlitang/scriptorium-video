import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

async function waitForServer(baseUrl, server, logsRef) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Studio server exited early (${server.exitCode}). Logs:\n${logsRef.value}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/projects`);
      if (response.ok) return;
    } catch {
      // Keep polling until server is ready.
    }
    await delay(120);
  }
  throw new Error("Studio server did not start in time.");
}

async function api(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`API ${pathname} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

test("studio draft flow works end-to-end in test mode", async () => {
  if (process.env.LVSTUDIO_RUN_SERVER_TESTS !== "1") {
    return;
  }
  const projectId = `it-${Date.now().toString(36)}`;
  const port = 4200 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const logsRef = { value: "" };
  const server = spawn("node", ["apps/studio/server.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      LVSTUDIO_TEST_MODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout?.on("data", (chunk) => {
    logsRef.value += chunk.toString();
  });
  server.stderr?.on("data", (chunk) => {
    logsRef.value += chunk.toString();
  });
  try {
    await waitForServer(baseUrl, server, logsRef);

    const created = await api(baseUrl, "/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: projectId,
        title: "Integration Test",
        mode: "short_story",
        platform: "local_only"
      })
    });
    assert.equal(created.data.projectId, projectId);

    const planned = await api(baseUrl, `/api/projects/${projectId}/plan-from-story`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        story: "A quiet street. A knock at midnight. No one outside.",
        feel: "cinematic suspense",
        pacing: "measured",
        visualStyle: "dark cinematic realism",
        format: "short_story"
      })
    });
    const beat = planned.data.plan.sections[0].beats[0];
    assert.equal(typeof beat.voiceDirection?.profile, "string");

    await api(baseUrl, `/api/projects/${projectId}/plan`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(planned.data.plan)
    });

    const queued = await api(baseUrl, `/api/projects/${projectId}/draft-job`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plan: planned.data.plan,
        story: "",
        imageEnabled: false
      })
    });
    assert.equal(queued.data.kind, "draft_job");

    let status = queued.data.status;
    const pollDeadline = Date.now() + 20_000;
    while (status !== "completed" && Date.now() < pollDeadline) {
      await delay(200);
      const polled = await api(baseUrl, `/api/projects/${projectId}/draft-job`);
      status = polled.data?.status || status;
      if (status === "failed") {
        throw new Error(`Draft job failed: ${polled.data?.error || "unknown error"}`);
      }
    }
    assert.equal(status, "completed");

    const renders = await api(baseUrl, `/api/projects/${projectId}/renders`);
    assert.ok((renders.data.renders || []).some((entry) => entry.quality === "draft"));
  } finally {
    server.kill("SIGTERM");
  }
});
