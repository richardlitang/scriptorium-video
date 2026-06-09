import path from "node:path";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  buildRenderBundle,
  buildQualityRepairPlan,
  createProjectScaffold,
  generateCaptionsForProject,
  generateTTSForProject,
  getProjectPaths,
  importMediaToProject,
  loadProject,
  resolveConfig,
  syncProject,
  transcribeProject,
  validateProject,
} from "@lvstudio/core";
import type { RendererProvider, TTSProvider, TranscriptionProvider } from "@lvstudio/core";
import { rendererProviders, transcriptionProviders, ttsProviders } from "@lvstudio/providers";
import { runQualityChecks, runQualityChecksForBundle } from "@lvstudio/quality";
import { runRenderWorkflow } from "@lvstudio/workflows";

const CreateProjectInput = z.object({
  projectId: z.string().min(1),
  mode: z.enum(["short_story", "long_documentary"]),
  targetPlatform: z
    .enum(["youtube", "youtube_shorts", "local_only", "linkedin"])
    .default("local_only"),
});
const ProjectIdInput = z.object({
  projectId: z.string().min(1),
});
const RenderProjectInput = z.object({
  projectId: z.string().min(1),
  quality: z.enum(["draft", "final"]).default("draft"),
  force: z.boolean().optional(),
  noSync: z.boolean().optional(),
});
const GenerateTTSInput = z.object({
  projectId: z.string().min(1),
  provider: z.string().optional(),
  force: z.boolean().optional(),
  noCache: z.boolean().optional(),
  onlySection: z.string().optional(),
  onlyBeat: z.string().optional(),
});
const TranscribeInput = z.object({
  projectId: z.string().min(1),
  provider: z.string().optional(),
});
const PrepareDraftAssetsInput = z.object({
  projectId: z.string().min(1),
  ttsProvider: z.string().optional(),
  transcriptionProvider: z.string().optional(),
  forceTts: z.boolean().optional(),
  noTtsCache: z.boolean().optional(),
});
const ImportMediaInput = z.object({
  projectId: z.string().min(1),
  filePath: z.string().min(1),
  beat: z.string().min(1),
  role: z.enum(["primary_visual", "broll", "screen", "overlay"]).default("primary_visual"),
  section: z.string().optional(),
  copy: z.boolean().optional(),
});

type InputSchemaSpec = {
  required: string[];
  enums?: Record<string, string[]>;
};

export const LVSTUDIO_INPUT_SCHEMA_SPECS: Record<string, InputSchemaSpec> = {
  lvstudio_create_project: {
    required: ["projectId", "mode"],
    enums: {
      mode: ["short_story", "long_documentary"],
      targetPlatform: ["youtube", "youtube_shorts", "local_only", "linkedin"],
    },
  },
  lvstudio_get_project_status: { required: ["projectId"] },
  lvstudio_validate_project: { required: ["projectId"] },
  lvstudio_resolve_config: { required: ["projectId"] },
  lvstudio_sync_project: { required: ["projectId"] },
  lvstudio_run_quality_checks: { required: ["projectId"] },
  lvstudio_get_quality_report: { required: ["projectId"] },
  lvstudio_plan_quality_repairs: { required: ["projectId"] },
  lvstudio_render_project: {
    required: ["projectId"],
    enums: {
      quality: ["draft", "final"],
    },
  },
  lvstudio_generate_tts: { required: ["projectId"] },
  lvstudio_transcribe_project: { required: ["projectId"] },
  lvstudio_generate_captions: { required: ["projectId"] },
  lvstudio_prepare_draft_assets: { required: ["projectId"] },
  lvstudio_import_media: {
    required: ["projectId", "filePath", "beat"],
    enums: {
      role: ["primary_visual", "broll", "screen", "overlay"],
    },
  },
};

function text(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

type ToolError = {
  code: string;
  message: string;
  path?: string;
};

function okResult<T>(message: string, data?: T, warnings?: string[]) {
  return text({
    ok: true,
    message,
    data,
    warnings,
  });
}

function failResult(message: string, errors?: ToolError[]) {
  return text({
    ok: false,
    message,
    errors,
  });
}

export const LVSTUDIO_TOOLS = [
  {
    name: "lvstudio_list_projects",
    description: "List local projects with minimal metadata.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_create_project",
    description: "Create a project scaffold.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        mode: { type: "string", enum: ["short_story", "long_documentary"] },
        targetPlatform: {
          type: "string",
          enum: ["youtube", "youtube_shorts", "local_only", "linkedin"],
        },
      },
      required: ["projectId", "mode"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_get_project_status",
    description: "Get project status summary.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_validate_project",
    description: "Validate project artifacts.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_resolve_config",
    description: "Resolve project render config.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_sync_project",
    description: "Run timeline sync and metadata probing.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_run_quality_checks",
    description: "Run quality checks and return pass/warn/fail result.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_render_project",
    description: "Validate, sync, check, and render a project output.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        quality: { type: "string", enum: ["draft", "final"] },
        force: { type: "boolean" },
        noSync: { type: "boolean" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_get_quality_report",
    description: "Get last quality report (computed live).",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_plan_quality_repairs",
    description:
      "Run quality checks and return a bounded, non-mutating repair plan for known findings.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_generate_tts",
    description: "Generate per-beat voiceover assets through the selected TTS provider.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        provider: { type: "string" },
        force: { type: "boolean" },
        noCache: { type: "boolean" },
        onlySection: { type: "string" },
        onlyBeat: { type: "string" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_transcribe_project",
    description: "Generate transcript JSON from voiceover assets.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        provider: { type: "string" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_generate_captions",
    description: "Generate captions from transcript and timeline.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_prepare_draft_assets",
    description:
      "Run the deterministic draft asset pipeline: validate, sync, generate TTS, transcribe, captions, and quality checks.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        ttsProvider: { type: "string" },
        transcriptionProvider: { type: "string" },
        forceTts: { type: "boolean" },
        noTtsCache: { type: "boolean" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "lvstudio_import_media",
    description: "Import a local media file and register it to a beat in asset-manifest.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        filePath: { type: "string" },
        beat: { type: "string" },
        role: { type: "string", enum: ["primary_visual", "broll", "screen", "overlay"] },
        section: { type: "string" },
        copy: { type: "boolean" },
      },
      required: ["projectId", "filePath", "beat"],
      additionalProperties: false,
    },
  },
];

type LvStudioToolHandlerDeps = {
  buildRenderBundle: typeof buildRenderBundle;
  buildQualityRepairPlan: typeof buildQualityRepairPlan;
  createProjectScaffold: typeof createProjectScaffold;
  generateCaptionsForProject: typeof generateCaptionsForProject;
  generateTTSForProject: typeof generateTTSForProject;
  getProjectPaths: typeof getProjectPaths;
  importMediaToProject: typeof importMediaToProject;
  loadProject: typeof loadProject;
  resolveConfig: typeof resolveConfig;
  runRenderWorkflow: typeof runRenderWorkflow;
  runQualityChecks: typeof runQualityChecks;
  runQualityChecksForBundle: typeof runQualityChecksForBundle;
  syncProject: typeof syncProject;
  transcribeProject: typeof transcribeProject;
  validateProject: typeof validateProject;
  rendererProviders: Record<string, RendererProvider>;
  transcriptionProviders: Record<string, TranscriptionProvider>;
  ttsProviders: Record<string, TTSProvider>;
};

const defaultToolHandlerDeps: LvStudioToolHandlerDeps = {
  buildRenderBundle,
  buildQualityRepairPlan,
  createProjectScaffold,
  generateCaptionsForProject,
  generateTTSForProject,
  getProjectPaths,
  importMediaToProject,
  loadProject,
  resolveConfig,
  runRenderWorkflow,
  runQualityChecks,
  runQualityChecksForBundle,
  syncProject,
  transcribeProject,
  validateProject,
  rendererProviders,
  transcriptionProviders,
  ttsProviders,
};

export function createLvStudioToolHandler(
  deps: Partial<LvStudioToolHandlerDeps> = {},
): (name: string, args: unknown) => Promise<ReturnType<typeof text>> {
  const toolDeps = { ...defaultToolHandlerDeps, ...deps };
  return (name: string, args: unknown) => handleLvStudioToolCallWithDeps(toolDeps, name, args);
}

async function handleLvStudioToolCallWithDeps(
  deps: LvStudioToolHandlerDeps,
  name: string,
  args: unknown,
) {
  switch (name) {
    case "lvstudio_list_projects": {
      const root = path.resolve(process.cwd(), "content", "projects");
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
      const projects = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectId = entry.name;
        const loaded = await deps.loadProject(projectId).catch(() => undefined);
        if (!loaded) continue;
        projects.push({
          id: loaded.project.id,
          title: loaded.project.title,
          status: loaded.project.status,
          mode: loaded.videoPlan.mode,
          targetPlatform: loaded.videoPlan.targetPlatform,
          updatedAt: loaded.project.updatedAt,
        });
      }
      return okResult("Projects listed.", { projects });
    }
    case "lvstudio_create_project": {
      const input = CreateProjectInput.parse(args ?? {});
      await deps.createProjectScaffold(input.projectId, input.mode, input.targetPlatform);
      return okResult("Project created.", { projectId: input.projectId });
    }
    case "lvstudio_get_project_status": {
      const input = ProjectIdInput.parse(args ?? {});
      const loaded = await deps.loadProject(input.projectId);
      return okResult("Project status loaded.", {
        project: loaded.project,
        mode: loaded.videoPlan.mode,
        targetPlatform: loaded.videoPlan.targetPlatform,
        assets: loaded.assetManifest.assets.length,
        captions: loaded.captions?.captions.length ?? 0,
      });
    }
    case "lvstudio_validate_project": {
      const input = ProjectIdInput.parse(args ?? {});
      await deps.validateProject(input.projectId);
      return okResult("Project validated.", { projectId: input.projectId });
    }
    case "lvstudio_resolve_config": {
      const input = ProjectIdInput.parse(args ?? {});
      const loaded = await deps.validateProject(input.projectId);
      const config = await deps.resolveConfig(loaded.videoPlan);
      return okResult("Resolved config.", { config });
    }
    case "lvstudio_sync_project": {
      const input = ProjectIdInput.parse(args ?? {});
      const sync = await deps.syncProject(input.projectId);
      return okResult("Project synced.", { timeline: sync.timeline, issues: sync.issues });
    }
    case "lvstudio_run_quality_checks":
    case "lvstudio_get_quality_report": {
      const input = ProjectIdInput.parse(args ?? {});
      const result = await deps.runQualityChecks(input.projectId);
      return okResult("Quality checks completed.", { result });
    }
    case "lvstudio_plan_quality_repairs": {
      const input = ProjectIdInput.parse(args ?? {});
      const quality = await deps.runQualityChecks(input.projectId);
      const repairPlan = deps.buildQualityRepairPlan(quality);
      return okResult("Quality repair plan prepared.", { quality, repairPlan });
    }
    case "lvstudio_render_project": {
      const input = RenderProjectInput.parse(args ?? {});
      const result = await deps.runRenderWorkflow(
        {
          projectId: input.projectId,
          quality: input.quality,
          force: input.force,
          noSync: input.noSync,
        },
        {
          buildRenderBundle: deps.buildRenderBundle,
          getProjectPaths: deps.getProjectPaths,
          runQualityChecksForBundle: deps.runQualityChecksForBundle,
          syncProject: deps.syncProject,
          validateProject: deps.validateProject,
          rendererProviders: deps.rendererProviders,
        },
      );
      if (result.status === "blocked") {
        return failResult("Render blocked by failing quality checks.", [
          {
            code: "quality.fail",
            message: JSON.stringify(result.quality),
          },
        ]);
      }
      return okResult("Render completed.", {
        renderResult: result.renderResult,
        quality: result.quality,
      });
    }
    case "lvstudio_generate_tts": {
      const input = GenerateTTSInput.parse(args ?? {});
      const loaded = await deps.validateProject(input.projectId);
      const providerId = input.provider ?? loaded.videoPlan.providers.tts;
      const provider = deps.ttsProviders[providerId];
      if (!provider) {
        return failResult(`Unknown TTS provider: ${providerId}`, [
          { code: "provider.tts.unknown", message: providerId },
        ]);
      }
      const result = await deps.generateTTSForProject(input.projectId, provider, {
        force: input.force,
        noCache: input.noCache,
        onlySection: input.onlySection,
        onlyBeat: input.onlyBeat,
      });
      return okResult("TTS generation completed.", { providerId, result });
    }
    case "lvstudio_transcribe_project": {
      const input = TranscribeInput.parse(args ?? {});
      const loaded = await deps.validateProject(input.projectId);
      const providerId = input.provider ?? loaded.videoPlan.providers.transcription;
      const provider = deps.transcriptionProviders[providerId];
      if (!provider) {
        return failResult(`Unknown transcription provider: ${providerId}`, [
          { code: "provider.transcription.unknown", message: providerId },
        ]);
      }
      const result = await deps.transcribeProject(input.projectId, provider);
      return okResult("Transcription completed.", { providerId, result });
    }
    case "lvstudio_generate_captions": {
      const input = ProjectIdInput.parse(args ?? {});
      await deps.validateProject(input.projectId);
      const result = await deps.generateCaptionsForProject(input.projectId);
      return okResult("Captions generated.", { result });
    }
    case "lvstudio_prepare_draft_assets": {
      const input = PrepareDraftAssetsInput.parse(args ?? {});
      const loaded = await deps.validateProject(input.projectId);
      const sync = await deps.syncProject(input.projectId);
      const ttsProviderId = input.ttsProvider ?? loaded.videoPlan.providers.tts;
      const ttsProvider = deps.ttsProviders[ttsProviderId];
      if (!ttsProvider) {
        return failResult(`Unknown TTS provider: ${ttsProviderId}`, [
          { code: "provider.tts.unknown", message: ttsProviderId },
        ]);
      }
      const tts = await deps.generateTTSForProject(input.projectId, ttsProvider, {
        force: input.forceTts,
        noCache: input.noTtsCache,
      });
      const transcriptionProviderId =
        input.transcriptionProvider ?? loaded.videoPlan.providers.transcription;
      const transcriptionProvider = deps.transcriptionProviders[transcriptionProviderId];
      if (!transcriptionProvider) {
        return failResult(`Unknown transcription provider: ${transcriptionProviderId}`, [
          { code: "provider.transcription.unknown", message: transcriptionProviderId },
        ]);
      }
      const transcript = await deps.transcribeProject(input.projectId, transcriptionProvider);
      const captions = await deps.generateCaptionsForProject(input.projectId);
      const quality = await deps.runQualityChecks(input.projectId);
      return okResult("Draft assets prepared.", {
        sync,
        tts: { providerId: ttsProviderId, result: tts },
        transcript: { providerId: transcriptionProviderId, result: transcript },
        captions,
        quality,
      });
    }
    case "lvstudio_import_media": {
      const input = ImportMediaInput.parse(args ?? {});
      await deps.validateProject(input.projectId);
      const result = await deps.importMediaToProject(input.projectId, input.filePath, {
        beat: input.beat,
        role: input.role,
        section: input.section,
        copy: input.copy,
      });
      return okResult("Media imported.", { result });
    }
    default:
      return failResult(`Unknown tool: ${name}`, [{ code: "tool.unknown", message: name }]);
  }
}

export const handleLvStudioToolCall = createLvStudioToolHandler();

export function createLvStudioMcpServer() {
  const server = new Server(
    {
      name: "lvstudio-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: LVSTUDIO_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleLvStudioToolCall(name, args);
  });

  return server;
}

export async function startLvStudioMcpServer() {
  const server = createLvStudioMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startLvStudioMcpServer();
}
