import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["packages/cli/dist/index.js", ...args], {
      cwd: new URL("../../..", import.meta.url),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("CLI prints Chatterbox setup errors without an uncaught stack trace", async () => {
  const result = await runCli(
    ["generate:tts", "demo", "--provider", "chatterbox", "--only-beat", "the-discovery-001", "--force", "--no-cache"],
    { CHATTERBOX_TTS_URL: "http://127.0.0.1:9/v1/audio/speech" }
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Chatterbox TTS server is unreachable/);
  assert.match(result.stderr, /scripts\/chatterbox_tts_server\.py/);
  assert.doesNotMatch(result.stderr, /triggerUncaughtException/);
  assert.doesNotMatch(result.stderr, /node:internal/);
});
