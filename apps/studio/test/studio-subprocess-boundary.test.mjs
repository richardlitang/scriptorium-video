import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

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

test("Studio production callsites do not use the lvstudio subprocess seam", async () => {
  const modules = await productionModules(new URL("../lib/", import.meta.url));
  const violations = [];
  const commandCall = /runLvstudio(?:ForDraft)?\s*\([\s\S]{0,80}?\[\s*["']([^"']+)["']/g;

  for (const moduleUrl of modules) {
    const source = await readFile(moduleUrl, "utf8");
    for (const match of source.matchAll(commandCall)) {
      violations.push(`${moduleUrl.pathname.split("/apps/studio/")[1]}: ${match[1]}`);
    }
  }

  assert.deepEqual(violations, []);
});
