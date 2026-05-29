import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const scanDirs = ["apps/studio/lib", "apps/studio/server.mjs"];

const allowedFiles = new Set(["apps/studio/test/draft-flow-integration.test.mjs"]);

function runRipgrep() {
  try {
    return execFileSync("rg", ["-n", "process\\.env\\.[A-Z][A-Z0-9_]*", ...scanDirs], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch (error) {
    if (error?.status === 1) return "";
    throw error;
  }
}

const raw = runRipgrep().trim();
if (!raw) {
  console.log("check-studio-env-boundary passed.");
  process.exit(0);
}

const violations = [];
for (const line of raw.split("\n")) {
  const firstColon = line.indexOf(":");
  if (firstColon === -1) continue;
  const filePath = line.slice(0, firstColon);
  const normalized = path.normalize(filePath).replaceAll(path.sep, "/");
  if (!allowedFiles.has(normalized)) {
    violations.push(line);
  }
}

if (violations.length > 0) {
  console.error(
    "check-studio-env-boundary failed: direct process.env reads are not allowed in Studio runtime code.",
  );
  for (const line of violations) console.error(`  ${line}`);
  process.exit(1);
}

console.log("check-studio-env-boundary passed.");
