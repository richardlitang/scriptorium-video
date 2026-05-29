import { access } from "node:fs/promises";
import process from "node:process";

const requiredDoc = "docs/plans/2026-05-28-focused-goal-completion-audit.md";

try {
  await access(requiredDoc);
  console.log("check-focused-audit-doc passed.");
} catch {
  console.error(`check-focused-audit-doc failed: missing ${requiredDoc}`);
  process.exit(1);
}
