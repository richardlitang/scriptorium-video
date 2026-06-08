import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LVSTUDIO_INPUT_SCHEMA_SPECS,
  LVSTUDIO_TOOLS,
  createLvStudioMcpServer,
  createLvStudioToolHandler,
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
    "lvstudio_prepare_draft_assets",
    "lvstudio_plan_quality_repairs",
  ]) {
    assert.ok(unique.has(required), `expected tool ${required}`);
  }
});

test("plan quality repairs returns bounded actions from current quality report", async () => {
  const handler = createLvStudioToolHandler({
    runQualityChecks: async (projectId) => ({
      status: "fail",
      checks: [
        {
          id: "shared.beat.media",
          severity: "error",
          message: `Beat missing-media in ${projectId} needs media.`,
          sectionId: "s1",
          beatId: "missing-media",
        },
      ],
    }),
  });

  const response = await handler("lvstudio_plan_quality_repairs", { projectId: "demo" });
  const parsed = JSON.parse(response.content[0].text);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.message, "Quality repair plan prepared.");
  assert.equal(parsed.data.quality.status, "fail");
  assert.deepEqual(parsed.data.repairPlan.actions, [
    {
      kind: "resolve_media",
      severity: "error",
      reason: "Beat missing-media in demo needs media.",
      sectionId: "s1",
      beatId: "missing-media",
    },
  ]);
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

test("prepare draft assets workflow runs deterministic project stages in order", async () => {
  const calls = [];
  const handler = createLvStudioToolHandler({
    validateProject: async (projectId) => {
      calls.push(["validate", projectId]);
      return {
        videoPlan: {
          providers: {
            tts: "fake-tts",
            transcription: "fake-transcription",
          },
        },
      };
    },
    syncProject: async (projectId) => {
      calls.push(["sync", projectId]);
      return { timeline: { segments: [] }, issues: [] };
    },
    generateTTSForProject: async (projectId, provider, options) => {
      calls.push(["tts", projectId, provider.id, options]);
      return { generated: 2 };
    },
    transcribeProject: async (projectId, provider) => {
      calls.push(["transcribe", projectId, provider.id]);
      return { transcriptPath: "captions/transcript.json" };
    },
    generateCaptionsForProject: async (projectId) => {
      calls.push(["captions", projectId]);
      return { captionsPath: "captions/captions.json" };
    },
    runQualityChecks: async (projectId) => {
      calls.push(["quality", projectId]);
      return { status: "warn", checks: [] };
    },
    ttsProviders: {
      "fake-tts": { id: "fake-tts" },
      overrideTts: { id: "overrideTts" },
    },
    transcriptionProviders: {
      "fake-transcription": { id: "fake-transcription" },
      overrideTranscription: { id: "overrideTranscription" },
    },
  });

  const response = await handler("lvstudio_prepare_draft_assets", {
    projectId: "demo",
    ttsProvider: "overrideTts",
    transcriptionProvider: "overrideTranscription",
    forceTts: true,
    noTtsCache: true,
  });
  const parsed = JSON.parse(response.content[0].text);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.message, "Draft assets prepared.");
  assert.equal(parsed.data.quality.status, "warn");
  assert.deepEqual(calls, [
    ["validate", "demo"],
    ["sync", "demo"],
    [
      "tts",
      "demo",
      "overrideTts",
      {
        force: true,
        noCache: true,
      },
    ],
    ["transcribe", "demo", "overrideTranscription"],
    ["captions", "demo"],
    ["quality", "demo"],
  ]);
});
