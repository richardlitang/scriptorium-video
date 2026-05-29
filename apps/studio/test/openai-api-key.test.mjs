import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseEnvFile, resolveOpenAiApiKey } from "../lib/planner/openai-api-key.mjs";

test("Studio OpenAI API key helper parses env file content", () => {
  const parsed = parseEnvFile("OPENAI_API_KEY='studio-key'\n# comment\nOTHER=value\n");

  assert.equal(parsed.OPENAI_API_KEY, "studio-key");
  assert.equal(parsed.OTHER, "value");
});

test("Studio OpenAI API key helper reads configured env file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-studio-openai-key-"));
  try {
    const envPath = path.join(root, "openai.env");
    await writeFile(envPath, "OPENAI_API_KEY=studio-file-key\n", "utf8");

    const key = await resolveOpenAiApiKey({
      env: { LVSTUDIO_OPENAI_ENV_FILE: envPath },
      rootDir: root,
    });

    assert.equal(key, "studio-file-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
