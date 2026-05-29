import { readFile } from "node:fs/promises";
import process from "node:process";

const serverPath = "apps/studio/server.mjs";
const maxLines = 80;

const source = await readFile(serverPath, "utf8");
const lineCount = source.split("\n").length;

if (lineCount > maxLines) {
  console.error(
    `check-studio-server-bootstrap failed: ${serverPath} has ${lineCount} lines (limit ${maxLines}).`,
  );
  process.exit(1);
}

const bannedMarkers = [
  "createDraftJobRunner(",
  "createImageGenerationRunner(",
  "createProjectOps(",
  "createSplitPlannerRuntime(",
  "createStudioRuntimeWiring(",
  "createVoicePreviewAndHealth(",
];

const found = bannedMarkers.filter((marker) => source.includes(marker));
if (found.length > 0) {
  console.error(
    `check-studio-server-bootstrap failed: ${serverPath} contains runtime assembly markers:\n` +
      found.map((entry) => `  - ${entry}`).join("\n"),
  );
  process.exit(1);
}

console.log("check-studio-server-bootstrap passed.");
