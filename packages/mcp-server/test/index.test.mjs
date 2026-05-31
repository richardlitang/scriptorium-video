import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LVSTUDIO_INPUT_SCHEMA_SPECS,
  LVSTUDIO_TOOLS,
  createLvStudioMcpServer,
  handleLvStudioToolCall,
} from "../dist/index.js";

test("mcp tool registry contains unique lvstudio tool names", () => {
  assert.ok(Array.isArray(LVSTUDIO_TOOLS));
  assert.ok(LVSTUDIO_TOOLS.length >= 12);

  const names = LVSTUDIO_TOOLS.map((tool) => tool.name);
  const unique = new Set(names);
  assert.equal(unique.size, names.length);

  for (const required of [
    "lvstudio_list_projects",
    "lvstudio_create_project",
    "lvstudio_validate_project",
    "lvstudio_sync_project",
    "lvstudio_run_quality_checks",
    "lvstudio_render_project",
  ]) {
    assert.ok(unique.has(required), `expected tool ${required}`);
  }
});

test("createLvStudioMcpServer returns a server instance", () => {
  const server = createLvStudioMcpServer();
  assert.ok(server);
  assert.equal(typeof server.connect, "function");
});

test("handleLvStudioToolCall returns structured failure for unknown tools", async () => {
  const response = await handleLvStudioToolCall("lvstudio_unknown", {});
  assert.equal(Array.isArray(response.content), true);
  assert.equal(response.content[0].type, "text");
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /Unknown tool/);
  assert.equal(parsed.errors[0].code, "tool.unknown");
});

test("handleLvStudioToolCall lists projects with structured payload", async () => {
  const response = await handleLvStudioToolCall("lvstudio_list_projects", {});
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.message, "Projects listed.");
  assert.equal(Array.isArray(parsed.data.projects), true);
});

test("tool input schemas stay aligned with source input schema specs", () => {
  const byName = new Map(LVSTUDIO_TOOLS.map((tool) => [tool.name, tool]));
  for (const [toolName, spec] of Object.entries(LVSTUDIO_INPUT_SCHEMA_SPECS)) {
    const tool = byName.get(toolName);
    assert.ok(tool, `missing tool definition for ${toolName}`);
    const schema = tool.inputSchema ?? {};
    const required = [...(schema.required ?? [])].sort();
    assert.deepEqual(required, [...spec.required].sort(), `${toolName} required keys mismatch`);
    for (const [fieldName, expectedEnum] of Object.entries(spec.enums ?? {})) {
      const field = schema.properties?.[fieldName];
      assert.ok(field, `${toolName}.${fieldName} is missing`);
      assert.deepEqual(
        [...(field.enum ?? [])],
        expectedEnum,
        `${toolName}.${fieldName} enum mismatch`,
      );
    }
  }
});
