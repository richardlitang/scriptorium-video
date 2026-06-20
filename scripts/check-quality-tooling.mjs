import { readFile } from "node:fs/promises";
import process from "node:process";

const failures = [];

const [packageJsonText, eslintConfig, prettierIgnore, workflow] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("eslint.config.js", "utf8"),
  readFile(".prettierignore", "utf8"),
  readFile(".github/workflows/verify.yml", "utf8"),
]);
const packageJson = JSON.parse(packageJsonText);

if (!packageJson.scripts?.lint?.includes("--max-warnings 87")) {
  failures.push("lint must lock the current 87-warning baseline.");
}
if (!packageJson.scripts?.verify?.includes("check:quality-tooling")) {
  failures.push("verify must run check:quality-tooling.");
}
if (!eslintConfig.includes('".worktrees/**"')) {
  failures.push("ESLint must ignore .worktrees.");
}
if (!prettierIgnore.split(/\r?\n/).includes(".worktrees/")) {
  failures.push("Prettier must ignore .worktrees.");
}
if (!workflow.includes("pnpm -s verify")) {
  failures.push("CI must invoke pnpm -s verify.");
}

if (failures.length > 0) {
  console.error("check-quality-tooling failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("check-quality-tooling passed.");
