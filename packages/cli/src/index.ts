import { Command } from "commander";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  buildRenderBundle,
  writeJsonFile,
  getProjectPaths,
  resolveConfig,
  syncProject,
  validateProject
} from "@lvstudio/core";
import { rendererProviders } from "@lvstudio/providers";
import { createProject } from "./create-project.js";

const program = new Command();

program
  .name("lvstudio")
  .description("Local-first video production CLI")
  .version("0.1.0");

program
  .command("create")
  .argument("<project-id>")
  .requiredOption("--mode <mode>")
  .option("--platform <platform>", "target platform", "local_only")
  .action(async (projectId, options) => {
    await createProject(projectId, options.mode, options.platform);
    console.log(`Created content/projects/${projectId}`);
  });

program
  .command("validate")
  .argument("<project-id>")
  .action(async (projectId) => {
    await validateProject(projectId);
    console.log(`Project ${projectId} is valid.`);
  });

program
  .command("resolve-config")
  .argument("<project-id>")
  .option("--write", "write .resolved-config.json")
  .action(async (projectId, options) => {
    const loaded = await validateProject(projectId);
    const config = await resolveConfig(loaded.videoPlan);
    console.log(JSON.stringify(config, null, 2));
    if (options.write) {
      await writeJsonFile(`${getProjectPaths(projectId).projectDir}/.resolved-config.json`, config);
    }
  });

program
  .command("sync")
  .argument("<project-id>")
  .action(async (projectId) => {
    const result = await syncProject(projectId);
    const timeline = result.timeline;
    console.log(
      `Synced ${projectId}: ${timeline.segments.length} segments, ${timeline.durationSeconds.toFixed(2)}s.`
    );
    if (result.staleAssetIds.length > 0) {
      console.log(`Stale assets: ${result.staleAssetIds.join(", ")}`);
    }
    const warnings = result.issues.filter((issue) => issue.level === "warning");
    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.log(`Warning: ${warning.message}`);
      }
    }
  });

program
  .command("render")
  .argument("<project-id>")
  .option("--quality <quality>", "draft or final", "draft")
  .option("--no-sync", "use existing timeline.json")
  .option("--provider <provider>", "override renderer provider id")
  .action(async (projectId, options) => {
    await validateProject(projectId);
    if (options.sync !== false) {
      await syncProject(projectId);
    }
    const bundle = await buildRenderBundle({ projectId });
    const providerId = options.provider ?? bundle.videoPlan.providers.renderer;
    const renderer = rendererProviders[providerId];
    if (!renderer) {
      throw new Error(`Unknown renderer provider: ${providerId}`);
    }
    const quality = options.quality === "final" ? "final" : "draft";
    const projectPaths = getProjectPaths(projectId);
    await mkdir(projectPaths.rendersDir, { recursive: true });
    const outputPath = path.join(projectPaths.rendersDir, `${quality}.mp4`);
    const result = await renderer.render({
      projectDir: projectPaths.projectDir,
      renderBundle: bundle,
      outputPath,
      quality
    });
    console.log(`Rendered ${result.outputPath}`);
  });

await program.parseAsync(process.argv);
