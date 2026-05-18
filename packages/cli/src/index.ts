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
import { runQualityChecks } from "@lvstudio/quality";
import { createProject } from "./create-project.js";
import { exportProject } from "./export-project.js";
import { generateCaptions } from "./captions.js";
import { generateTTS } from "./generate-tts.js";
import { importMedia } from "./import-media.js";
import { projectStatus } from "./status.js";
import { transcribeProjectCli } from "./transcribe.js";

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
  .command("status")
  .argument("<project-id>")
  .action(async (projectId) => {
    await validateProject(projectId);
    await projectStatus(projectId);
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
  .command("generate:tts")
  .argument("<project-id>")
  .option("--provider <provider>", "override TTS provider id")
  .option("--force", "overwrite locked/edited assets")
  .option("--no-cache", "disable hash cache reuse")
  .option("--only-section <section-id>", "generate for one section")
  .option("--only-beat <beat-id>", "generate for one beat")
  .action(async (projectId, options) => {
    await validateProject(projectId);
    await generateTTS(projectId, {
      provider: options.provider,
      force: options.force === true,
      noCache: options.noCache === true || options.cache === false,
      onlySection: options.onlySection,
      onlyBeat: options.onlyBeat
    });
  });

program
  .command("import:media")
  .argument("<project-id>")
  .argument("<file-path>")
  .requiredOption("--beat <beat-id>", "target beat id")
  .option("--role <role>", "asset role", "primary_visual")
  .option("--section <section-id>", "target section id")
  .option("--no-copy", "register file without copying into project assets")
  .action(async (projectId, filePath, options) => {
    await validateProject(projectId);
    await importMedia(projectId, filePath, {
      beat: options.beat,
      role: options.role as "primary_visual" | "broll" | "screen" | "overlay",
      section: options.section,
      copy: options.copy !== false
    });
  });

program
  .command("transcribe")
  .argument("<project-id>")
  .option("--provider <provider>", "override transcription provider id")
  .action(async (projectId, options) => {
    await validateProject(projectId);
    await transcribeProjectCli(projectId, { provider: options.provider });
  });

program
  .command("captions")
  .argument("<project-id>")
  .action(async (projectId) => {
    await validateProject(projectId);
    await generateCaptions(projectId);
  });

program
  .command("render")
  .argument("<project-id>")
  .option("--quality <quality>", "draft or final", "draft")
  .option("--no-sync", "use existing timeline.json")
  .option("--force", "render even if quality checks fail")
  .option("--provider <provider>", "override renderer provider id")
  .action(async (projectId, options) => {
    await validateProject(projectId);
    if (options.sync !== false) {
      await syncProject(projectId);
    }
    const bundle = await buildRenderBundle({ projectId });
    const qualityResult = await runQualityChecks(projectId);
    if (qualityResult.status === "fail" && options.force !== true) {
      throw new Error(
        `Render blocked by quality checks. Run 'lvstudio check ${projectId}' for details or pass --force.`
      );
    }
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

program
  .command("check")
  .argument("<project-id>")
  .action(async (projectId) => {
    await validateProject(projectId);
    const result = await runQualityChecks(projectId);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "fail") {
      process.exitCode = 1;
    }
  });

program
  .command("export")
  .argument("<project-id>")
  .action(async (projectId) => {
    await validateProject(projectId);
    await exportProject(projectId);
  });

await program.parseAsync(process.argv);
