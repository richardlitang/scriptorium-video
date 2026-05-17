import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  buildRenderBundle,
  createProjectScaffold,
  getProjectPaths,
  loadProject,
  resolveConfig,
  syncProject,
  validateProject
} from "@lvstudio/core";
import { rendererProviders } from "@lvstudio/providers";
import { runQualityChecks } from "@lvstudio/quality";

const CreateProjectInput = z.object({
  projectId: z.string().min(1),
  mode: z.enum(["short_story", "long_documentary"]),
  targetPlatform: z.enum(["youtube", "youtube_shorts", "local_only", "linkedin"]).default("local_only")
});
const ProjectIdInput = z.object({
  projectId: z.string().min(1)
});
const RenderProjectInput = z.object({
  projectId: z.string().min(1),
  quality: z.enum(["draft", "final"]).default("draft"),
  force: z.boolean().optional(),
  noSync: z.boolean().optional()
});

function text(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}

const server = new Server(
  {
    name: "lvstudio-mcp-server",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lvstudio_list_projects",
      description: "List local projects with minimal metadata.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: "lvstudio_create_project",
      description: "Create a project scaffold.",
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          mode: { type: "string", enum: ["short_story", "long_documentary"] },
          targetPlatform: { type: "string", enum: ["youtube", "youtube_shorts", "local_only", "linkedin"] }
        },
        required: ["projectId", "mode"],
        additionalProperties: false
      }
    },
    {
      name: "lvstudio_get_project_status",
      description: "Get project status summary.",
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false
      }
    },
    {
      name: "lvstudio_validate_project",
      description: "Validate project artifacts.",
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false
      }
    },
    {
      name: "lvstudio_resolve_config",
      description: "Resolve project render config.",
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false
      }
    },
    {
      name: "lvstudio_sync_project",
      description: "Run timeline sync and metadata probing.",
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false
      }
    },
    {
      name: "lvstudio_run_quality_checks",
      description: "Run quality checks and return pass/warn/fail result.",
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false
      }
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
          noSync: { type: "boolean" }
        },
        required: ["projectId"],
        additionalProperties: false
      }
    },
    {
      name: "lvstudio_get_quality_report",
      description: "Get last quality report (computed live).",
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case "lvstudio_list_projects": {
      const root = path.resolve(process.cwd(), "content", "projects");
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
      const projects = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectId = entry.name;
        const loaded = await loadProject(projectId).catch(() => undefined);
        if (!loaded) continue;
        projects.push({
          id: loaded.project.id,
          title: loaded.project.title,
          status: loaded.project.status,
          mode: loaded.videoPlan.mode,
          targetPlatform: loaded.videoPlan.targetPlatform,
          updatedAt: loaded.project.updatedAt
        });
      }
      return text({ ok: true, projects });
    }
    case "lvstudio_create_project": {
      const input = CreateProjectInput.parse(args ?? {});
      await createProjectScaffold(input.projectId, input.mode, input.targetPlatform);
      return text({ ok: true, projectId: input.projectId });
    }
    case "lvstudio_get_project_status": {
      const input = ProjectIdInput.parse(args ?? {});
      const loaded = await loadProject(input.projectId);
      return text({
        ok: true,
        data: {
          project: loaded.project,
          mode: loaded.videoPlan.mode,
          targetPlatform: loaded.videoPlan.targetPlatform,
          assets: loaded.assetManifest.assets.length,
          captions: loaded.captions?.captions.length ?? 0
        }
      });
    }
    case "lvstudio_validate_project": {
      const input = ProjectIdInput.parse(args ?? {});
      await validateProject(input.projectId);
      return text({ ok: true, projectId: input.projectId });
    }
    case "lvstudio_resolve_config": {
      const input = ProjectIdInput.parse(args ?? {});
      const loaded = await validateProject(input.projectId);
      const config = await resolveConfig(loaded.videoPlan);
      return text({ ok: true, config });
    }
    case "lvstudio_sync_project": {
      const input = ProjectIdInput.parse(args ?? {});
      const sync = await syncProject(input.projectId);
      return text({ ok: true, timeline: sync.timeline, issues: sync.issues });
    }
    case "lvstudio_run_quality_checks":
    case "lvstudio_get_quality_report": {
      const input = ProjectIdInput.parse(args ?? {});
      const result = await runQualityChecks(input.projectId);
      return text({ ok: true, result });
    }
    case "lvstudio_render_project": {
      const input = RenderProjectInput.parse(args ?? {});
      await validateProject(input.projectId);
      if (!input.noSync) {
        await syncProject(input.projectId);
      }
      const quality = await runQualityChecks(input.projectId);
      if (quality.status === "fail" && !input.force) {
        return text({
          ok: false,
          message: "Render blocked by failing quality checks.",
          result: quality
        });
      }
      const bundle = await buildRenderBundle({ projectId: input.projectId });
      const providerId = bundle.videoPlan.providers.renderer;
      const renderer = rendererProviders[providerId];
      if (!renderer) {
        return text({
          ok: false,
          message: `Unknown renderer provider: ${providerId}`
        });
      }
      const projectPaths = getProjectPaths(input.projectId);
      await mkdir(projectPaths.rendersDir, { recursive: true });
      const outputPath = path.join(projectPaths.rendersDir, `${input.quality}.mp4`);
      const renderResult = await renderer.render({
        projectDir: projectPaths.projectDir,
        renderBundle: bundle,
        outputPath,
        quality: input.quality
      });
      return text({ ok: true, renderResult, quality });
    }
    default:
      return text({ ok: false, message: `Unknown tool: ${name}` });
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
