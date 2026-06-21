import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { createLvstudioDraftRunner } from "../lib/draft/lvstudio-draft-runner.mjs";
import { createStudioOps } from "../lib/runtime/studio-ops.mjs";

const allowedCommands = ["generate:tts", "transcribe", "direct:voice"];

async function productionModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
        if (entry.isDirectory()) return productionModules(url);
        return /\.m[jt]s$/.test(entry.name) ? [url] : [];
      }),
    )
  ).flat();
}

test("generic Studio subprocess calls are limited to env-coupled voice commands", async () => {
  const executed = [];
  const ops = createStudioOps({
    path: { dirname: () => "/logs", join: (...parts) => parts.join("/") },
    mkdir: async () => {},
    appendFile: async () => {},
    execFileAsync: async (_file, args) => {
      executed.push(args[1]);
      return { stdout: "", stderr: "" };
    },
    readVoiceSettings: async () => ({}),
    voiceSettingsEnv: () => ({}),
    runLvstudioTestMode: async () => ({ stdout: "", stderr: "" }),
    studioTestMode: false,
    rootDir: "/repo",
    processEnv: {},
    qualityHistoryDir: "/quality",
    commandLogPath: "/logs/commands.ndjson",
  });

  for (const command of allowedCommands) await ops.runLvstudio([command, "demo"]);
  await assert.rejects(() => ops.runLvstudio(["sync", "demo"]), /not allowed.*sync/i);
  assert.deepEqual(executed, allowedCommands);
});

test("draft subprocess calls are limited to env-coupled audio commands", async () => {
  let spawned = false;
  const runLvstudioForDraft = createLvstudioDraftRunner({
    spawn: () => {
      spawned = true;
      throw new Error("unexpected spawn");
    },
    rootDir: "/repo",
    processEnv: {},
    voiceSettingsEnv: () => ({}),
    readVoiceSettings: async () => ({}),
    appendCommandLog: async () => {},
    updateRunProgress: async () => {},
    renderProgressPrefix: "LVSTUDIO_RENDER_PROGRESS ",
    runLvstudioTestModeFn: () => async () => ({ stdout: "", stderr: "" }),
    studioTestMode: false,
  });

  await assert.rejects(
    () => runLvstudioForDraft({ projectId: "demo" }, ["render", "demo"]),
    /not allowed.*render/i,
  );
  assert.equal(spawned, false);
});

test("Studio production callsites do not send safe commands through the subprocess seam", async () => {
  const modules = await productionModules(new URL("../lib/", import.meta.url));
  const violations = [];
  const commandCall = /runLvstudio(?:ForDraft)?\s*\([\s\S]{0,80}?\[\s*["']([^"']+)["']/g;

  for (const moduleUrl of modules) {
    const source = await readFile(moduleUrl, "utf8");
    for (const match of source.matchAll(commandCall)) {
      if (!allowedCommands.includes(match[1])) {
        violations.push(`${moduleUrl.pathname.split("/apps/studio/")[1]}: ${match[1]}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
