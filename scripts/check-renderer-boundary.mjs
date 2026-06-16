import process from "node:process";
import { grepFiles } from "./lib/grep-files.mjs";

const repoRoot = process.cwd();

const coreCliHits = grepFiles(/@remotion/, ["packages/core/src", "packages/cli/src"], {
  cwd: repoRoot,
}).trim();
if (coreCliHits) {
  console.error("Renderer boundary violation: @remotion import found in core/cli.");
  console.error(coreCliHits);
  process.exit(1);
}

const providerHits = grepFiles(/@remotion/, ["packages/providers/src/renderer/remotion"], {
  cwd: repoRoot,
}).trim();
if (!providerHits) {
  console.error("Expected @remotion import in remotion provider, but none found.");
  process.exit(1);
}

console.log("Renderer boundary check passed.");
