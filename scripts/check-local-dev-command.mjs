import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
expect(
  packageJson.scripts?.["start:full"] === "bash scripts/start-full.sh",
  "package.json must expose start:full as bash scripts/start-full.sh.",
);
expect(
  String(packageJson.scripts?.verify ?? "").includes("check:local-dev-command"),
  "verify must run check:local-dev-command.",
);

const tempDir = await mkdtemp(path.join(os.tmpdir(), "lvstudio-start-full-check-"));
try {
  const missingVenv = path.join(tempDir, "missing-venv");
  const result = spawnSync("bash", ["scripts/start-full.sh"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LVSTUDIO_CHATTERBOX_VENV: missingVenv,
      LVSTUDIO_START_FULL_DRY_RUN: "1",
    },
    encoding: "utf8",
  });

  expect(result.status === 0, `start-full dry run must exit 0. stderr: ${result.stderr}`);
  expect(
    result.stdout.includes("dry-run: pnpm -s setup:chatterbox"),
    "start-full dry run must show that missing Chatterbox setup will run.",
  );
  expect(
    result.stdout.includes("dry-run: pnpm -s start"),
    "start-full dry run must show that Studio will start after setup.",
  );
  expect(
    result.stdout.includes(`${missingVenv}/bin/python`),
    "start-full dry run must derive LVSTUDIO_CHATTERBOX_PYTHON from LVSTUDIO_CHATTERBOX_VENV.",
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("check-local-dev-command failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("check-local-dev-command passed.");
