import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const PACKAGE_DIRS = [
  "packages/core",
  "packages/providers",
  "packages/quality",
  "packages/cli",
  "packages/mcp-server",
  "apps/studio",
  "apps/renderer",
];

function hasDistImport(source) {
  return /from\s+["']\.\.?\/dist\//.test(source);
}

async function readIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function listMjsFiles(dirPath) {
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMjsFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(full);
  }
  return files;
}

async function main() {
  const failures = [];

  for (const relDir of PACKAGE_DIRS) {
    const packageJsonPath = path.join(ROOT, relDir, "package.json");
    const testDir = path.join(ROOT, relDir, "test");
    const pkgRaw = await readIfExists(packageJsonPath);
    if (!pkgRaw) continue;
    const pkg = JSON.parse(pkgRaw);

    let testFiles = [];
    try {
      testFiles = await listMjsFiles(testDir);
    } catch {
      testFiles = [];
    }

    let importsDist = false;
    for (const filePath of testFiles) {
      const source = await readIfExists(filePath);
      if (!source) continue;
      if (hasDistImport(source)) {
        importsDist = true;
        break;
      }
    }
    if (!importsDist) continue;

    const testScript = String(pkg.scripts?.test ?? "");
    const hasCompileStep = /\btsc\b/.test(testScript);
    if (!hasCompileStep) {
      failures.push(
        `${relDir}: tests import dist but package.json test script does not compile first.`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("check-test-dist-contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("check-test-dist-contract passed.");
}

await main();
