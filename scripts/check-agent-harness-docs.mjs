import { access, readFile } from "node:fs/promises";
import process from "node:process";

const rootDir = process.cwd();
const failures = [];

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function localPathFromMarkdownTarget(target) {
  const withoutAnchor = target.split("#")[0];
  const lineMatch = withoutAnchor.match(/^(.+):\d+$/);
  return lineMatch ? lineMatch[1] : withoutAnchor;
}

async function checkAgentGuideScripts() {
  const [agentGuide, packageJsonText] = await Promise.all([
    readFile("AGENTS.md", "utf8"),
    readFile("package.json", "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonText);
  const scripts = packageJson.scripts ?? {};
  const boundaryLine = agentGuide
    .split("\n")
    .find((line) => line.includes("Boundary checks") && line.includes("check:<name>"));
  if (!boundaryLine) {
    failures.push("AGENTS.md is missing the Boundary checks script list.");
    return;
  }
  const listedChecks = [...boundaryLine.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((value) => !["package.json", "pnpm -s check:<name>"].includes(value))
    .map((value) => (value.startsWith("check:") ? value : `check:${value}`));
  for (const checkName of listedChecks) {
    if (!scripts[checkName]) {
      failures.push(`AGENTS.md lists ${checkName}, but package.json has no matching script.`);
    }
  }
  if (agentGuide.includes("public/modules") || agentGuide.includes("public/app.js")) {
    failures.push("AGENTS.md still references deleted Studio public UI files.");
  }
}

async function checkMarkdownLocalLinks(filePath) {
  const text = await readFile(filePath, "utf8");
  const matches = [
    ...text.matchAll(/\]\((\/Users\/richardlitang\/code\/personal\/scriptorium\/[^)\s]+)\)/g),
  ];
  for (const match of matches) {
    const target = localPathFromMarkdownTarget(match[1]);
    if (!(await fileExists(target))) {
      failures.push(`${filePath} links to missing local path: ${target}`);
    }
  }
}

await checkAgentGuideScripts();
await checkMarkdownLocalLinks("docs/plans/2026-05-28-focused-goal-completion-audit.md");

if (failures.length > 0) {
  console.error("check-agent-harness-docs failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check-agent-harness-docs passed.");
