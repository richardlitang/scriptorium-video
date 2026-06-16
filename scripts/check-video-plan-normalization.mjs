import { readFile } from "node:fs/promises";
import path from "node:path";
import { grepFiles } from "./lib/grep-files.mjs";

const repoRoot = process.cwd();
const scanDir = "packages/core/src";
const allowFiles = new Set(["packages/core/src/migrate-video-plan.ts"]);

const raw = grepFiles(/readJsonFile\(.*VideoPlanSchema/, [scanDir], { cwd: repoRoot }).trim();
if (!raw) {
  console.log("check-video-plan-normalization passed.");
  process.exit(0);
}

const violations = [];
for (const line of raw.split("\n")) {
  const firstColon = line.indexOf(":");
  const secondColon = line.indexOf(":", firstColon + 1);
  if (firstColon === -1 || secondColon === -1) continue;
  const filePath = line.slice(0, firstColon).split(path.sep).join("/");
  const lineNo = Number(line.slice(firstColon + 1, secondColon));
  if (allowFiles.has(filePath)) continue;
  const source = await readFile(path.join(repoRoot, filePath), "utf8");
  const sourceLine = source.split(/\r?\n/)[lineNo - 1] ?? "";
  if (!sourceLine.includes("normalizeVideoPlan(")) {
    violations.push(`${filePath}:${lineNo}:${sourceLine.trim()}`);
  }
}

if (violations.length > 0) {
  console.error(
    "check-video-plan-normalization failed: VideoPlan reads must be normalized at read boundary.",
  );
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log("check-video-plan-normalization passed.");
