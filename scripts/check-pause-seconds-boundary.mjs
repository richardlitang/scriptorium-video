import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const scanDirs = [
  "apps/studio/lib",
  "apps/studio/public",
  "packages/cli/src",
  "packages/core/src",
  "packages/quality/src",
];

const allowedFiles = new Set([
  "apps/studio/lib/draft-voice-direction.mjs",
  "apps/studio/lib/canonicalize-plan.mjs",
  "apps/studio/public/modules/beat-workspace.js",
  "packages/core/src/schemas/video-plan.schema.ts",
  "packages/core/src/plan-legacy-fields.ts",
  "packages/core/src/voice-pauses.ts",
  "packages/quality/src/index.ts",
]);

function runRipgrep() {
  try {
    return execFileSync("rg", ["-n", "pauseBeforeSeconds|pauseAfterSeconds", ...scanDirs], {
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
  console.log("check-pause-seconds-boundary passed.");
  process.exit(0);
}

const disallowed = [];
for (const line of raw.split("\n")) {
  const firstColon = line.indexOf(":");
  if (firstColon === -1) continue;
  const filePath = line.slice(0, firstColon);
  const normalized = path.normalize(filePath).replaceAll(path.sep, "/");
  if (!allowedFiles.has(normalized)) {
    disallowed.push(line);
  }
}

if (disallowed.length > 0) {
  console.error(
    "check-pause-seconds-boundary failed: found pause seconds references outside allowlist.",
  );
  for (const line of disallowed) console.error(`  ${line}`);
  process.exit(1);
}

console.log("check-pause-seconds-boundary passed.");
