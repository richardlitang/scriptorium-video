import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("./portfolio-demo.sh", import.meta.url);

test("portfolio demo is isolated, deterministic, and avoids provider-backed work", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /mktemp -d/);
  assert.match(script, /trap 'rm -rf "\$DEMO_ROOT"' EXIT/);
  assert.match(script, /pnpm -s build/);
  assert.match(script, /create portfolio-proof --mode short_story --platform portfolio_site/);
  assert.match(script, /validate portfolio-proof/);
  assert.match(script, /resolve-config portfolio-proof/);
  assert.doesNotMatch(script, /generate:tts|render |OPENAI_API_KEY|curl /);
});
