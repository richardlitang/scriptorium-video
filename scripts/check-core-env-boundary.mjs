import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const scanDirs = ["packages/core/src"];

const allowedFiles = new Set(["packages/core/src/core-runtime-env.ts"]);

function runRipgrep() {
  try {
    return execFileSync(
      "rg",
      [
        "-n",
        "process\\.env\\.(LVSTUDIO_TTS_CONCURRENCY|LVSTUDIO_SFX_LIBRARY_DIR|LVSTUDIO_DEFAULT_MUSIC_BED|LVSTUDIO_ENABLE_AUTO_MUSIC_BED|LVSTUDIO_MUSIC_BED_LEVEL_DB)|env\\.(LVSTUDIO_TTS_CONCURRENCY|LVSTUDIO_SFX_LIBRARY_DIR|LVSTUDIO_DEFAULT_MUSIC_BED|LVSTUDIO_ENABLE_AUTO_MUSIC_BED|LVSTUDIO_MUSIC_BED_LEVEL_DB)",
        ...scanDirs,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
  } catch (error) {
    if (error?.status === 1) return "";
    throw error;
  }
}

const raw = runRipgrep().trim();
if (!raw) {
  console.log("check-core-env-boundary passed.");
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
    "check-core-env-boundary failed: direct LVSTUDIO env reads are not allowed outside core-runtime-env.ts.",
  );
  for (const line of violations) console.error(`  ${line}`);
  process.exit(1);
}

console.log("check-core-env-boundary passed.");
