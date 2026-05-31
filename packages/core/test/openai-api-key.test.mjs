import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseEnvFile, resolveOpenAiApiKey } from "../dist/openai-api-key.js";

test("parseEnvFile reads comments, blank lines, and quoted values", () => {
  const parsed = parseEnvFile(`
    # comment
    OPENAI_API_KEY="quoted-key"
    OTHER='value'

    EMPTY=
  `);

  assert.equal(parsed.OPENAI_API_KEY, "quoted-key");
  assert.equal(parsed.OTHER, "value");
  assert.equal(parsed.EMPTY, "");
});

test("resolveOpenAiApiKey prefers process env over env files", async () => {
  const key = await resolveOpenAiApiKey({
    env: { OPENAI_API_KEY: "env-key" },
    rootDir: "/missing",
  });

  assert.equal(key, "env-key");
});

test("resolveOpenAiApiKey reads explicit LVSTUDIO_OPENAI_ENV_FILE", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-openai-key-"));
  try {
    const envPath = path.join(root, "custom.env");
    await writeFile(envPath, "OPENAI_API_KEY=file-key\n", "utf8");

    const key = await resolveOpenAiApiKey({
      env: { LVSTUDIO_OPENAI_ENV_FILE: envPath },
      rootDir: path.join(root, "project"),
    });

    assert.equal(key, "file-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveOpenAiApiKey reads root .env.local fallback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-openai-root-key-"));
  try {
    await writeFile(path.join(root, ".env.local"), "OPENAI_API_KEY=root-key\n", "utf8");

    const key = await resolveOpenAiApiKey({ env: {}, rootDir: root });

    assert.equal(key, "root-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveOpenAiApiKey reads sibling support fallback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-openai-support-key-"));
  try {
    const projectRoot = path.join(root, "scriptorium");
    const supportDir = path.join(root, "support");
    await mkdir(projectRoot, { recursive: true });
    await mkdir(supportDir, { recursive: true });
    await writeFile(path.join(supportDir, ".env.local"), "OPENAI_API_KEY=support-key\n", "utf8");

    const key = await resolveOpenAiApiKey({ env: {}, rootDir: projectRoot });

    assert.equal(key, "support-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
