import { Command } from "commander";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import {
  buildRenderBundle,
  writeJsonFile,
  getProjectPaths,
  migrateVideoPlan,
  resolveConfig,
  syncProject,
  validateProject,
  reviewProject,
} from "@lvstudio/core";
import { rendererProviders } from "@lvstudio/providers";
import { runQualityChecks } from "@lvstudio/quality";
import { createProject } from "./create-project.js";
import { enrichAudioCli, ingestAudioCli } from "./audio-ingest.js";
import { exportProject } from "./export-project.js";
import { generateCaptions } from "./captions.js";
import { directVoice } from "./direct-voice.js";
import { generateTTS } from "./generate-tts.js";
import { importMedia } from "./import-media.js";
import { projectStatus } from "./status.js";
import { transcribeProjectCli } from "./transcribe.js";

const program = new Command();

const RENDER_PROGRESS_PREFIX = "__LVSTUDIO_RENDER_PROGRESS__";

async function listLocalProjectIds() {
  const projectsRoot = path.resolve(process.cwd(), "content", "projects");
  let entries;
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

program.name("lvstudio").description("Local-first video production CLI").version("0.1.0");

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
  .command("migrate:plan")
  .argument("[project-id]")
  .option("--all", "migrate every local project under content/projects")
  .option("--dry-run", "report whether canonical migration would change the plan")
  .action(async (projectId, options) => {
    if (options.all === true && projectId) {
      throw new Error("Pass either --all or <project-id>, not both.");
    }

    let projectIds: string[];
    if (options.all === true) {
      projectIds = await listLocalProjectIds();
    } else {
      projectIds = projectId ? [projectId] : [];
    }

    if (projectIds.length === 0) {
      throw new Error("Provide <project-id> or pass --all.");
    }

    let changedCount = 0;
    for (const id of projectIds) {
      await validateProject(id);
      const result = await migrateVideoPlan(id, {
        write: options.dryRun !== true,
      });
      if (!result.changed) {
        console.log(`Plan already canonical for ${id}.`);
        continue;
      }
      changedCount += 1;
      if (options.dryRun === true) {
        console.log(`Plan migration needed for ${id}: ${result.path}`);
        continue;
      }
      console.log(`Migrated plan for ${id}: ${result.path}`);
    }

    if (options.all === true) {
      const mode = options.dryRun === true ? "Dry-run" : "Migrated";
      console.log(`${mode} ${projectIds.length} projects; ${changedCount} changed.`);
    }
  });

program
  .command("sync")
  .argument("<project-id>")
  .action(async (projectId) => {
    const result = await syncProject(projectId);
    const timeline = result.timeline;
    console.log(
      `Synced ${projectId}: ${timeline.segments.length} segments, ${timeline.durationSeconds.toFixed(2)}s.`,
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
  .command("direct:voice")
  .argument("<project-id>")
  .option("--provider <provider>", "voice direction provider", "openai")
  .option("--from-file <path>", "load directed voice JSON from a local file")
  .option("--force", "overwrite user-authored voiceDirection")
  .action(async (projectId, options) => {
    await validateProject(projectId);
    await directVoice(projectId, {
      provider: options.provider,
      fromFile: options.fromFile,
      force: options.force === true,
    });
  });

program
  .command("generate:tts")
  .argument("<project-id>")
  .option("--provider <provider>", "override TTS provider id")
  .option("--force", "overwrite locked/edited assets")
  .option("--no-cache", "disable hash cache reuse")
  .option("--only-section <section-id>", "generate for one section")
  .option("--only-beat <beat-id>", "generate for one beat")
  .option("--concurrency <count>", "number of TTS jobs to run at once")
  .action(async (projectId, options) => {
    await validateProject(projectId);
    await generateTTS(projectId, {
      provider: options.provider,
      force: options.force === true,
      noCache: options.noCache === true || options.cache === false,
      onlySection: options.onlySection,
      onlyBeat: options.onlyBeat,
      concurrency: options.concurrency,
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
      copy: options.copy !== false,
    });
  });

program
  .command("audio:ingest")
  .argument("<project-id>")
  .argument("<file-path>")
  .requiredOption("--role <role>", "music or sfx")
  .option("--provider <provider>", "source provider, e.g. epidemic, artlist, youtube_audio_library")
  .option("--license-type <license-type>", "license descriptor, e.g. creator_subscription")
  .option("--asset-id <asset-id>", "stable asset id override")
  .option("--source-url <source-url>", "provider source URL")
  .option("--creator <creator>", "creator/artist credit")
  .option("--track-id <track-id>", "provider track id")
  .option("--attribution-required", "mark attribution as required")
  .option("--allowed-platforms <platforms>", "comma separated platforms", "youtube")
  .option("--downloaded-at <iso-date>", "ISO timestamp for license capture")
  .option("--youtube-audio-library", "apply YouTube Audio Library source defaults")
  .action(async (projectId, filePath, options) => {
    await validateProject(projectId);
    const roleInput = options.role as string | undefined;
    if (roleInput !== "music" && roleInput !== "sfx")
      throw new Error("--role must be either 'music' or 'sfx'.");
    const role = roleInput;
    const youtubePreset = options.youtubeAudioLibrary === true;
    if (!youtubePreset && !options.provider)
      throw new Error("--provider is required unless --youtube-audio-library is set.");
    if (!youtubePreset && !options.licenseType)
      throw new Error("--license-type is required unless --youtube-audio-library is set.");
    await ingestAudioCli(projectId, filePath, {
      role,
      assetId: options.assetId,
      provider: youtubePreset ? "youtube_audio_library" : options.provider,
      licenseType: youtubePreset ? "youtube_audio_library_license" : options.licenseType,
      sourceUrl: youtubePreset ? "https://studio.youtube.com/channel/UC/music" : options.sourceUrl,
      creator: youtubePreset ? "YouTube Audio Library" : options.creator,
      trackId: options.trackId,
      attributionRequired: options.attributionRequired === true,
      allowedPlatforms: youtubePreset ? "youtube,local_only" : options.allowedPlatforms,
      downloadedAt: options.downloadedAt,
    });
  });

program
  .command("audio:enrich")
  .argument("<project-id>")
  .option("--role <role>", "music or sfx")
  .option("--provider <provider>", "default provider for missing metadata")
  .option("--license-type <license-type>", "default license type for missing metadata")
  .option("--allowed-platforms <platforms>", "comma separated platforms", "youtube")
  .action(async (projectId, options) => {
    await validateProject(projectId);
    const roleRaw = options.role as string | undefined;
    const role = roleRaw === "music" || roleRaw === "sfx" ? roleRaw : undefined;
    await enrichAudioCli(projectId, {
      role,
      provider: options.provider,
      licenseType: options.licenseType,
      allowedPlatforms: options.allowedPlatforms,
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
        `Render blocked by quality checks. Run 'lvstudio check ${projectId}' for details or pass --force.`,
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
      quality,
      onProgress: (progress) => {
        console.log(`${RENDER_PROGRESS_PREFIX}${JSON.stringify(progress)}`);
      },
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
  .command("review")
  .argument("<project-id>")
  .action(async (projectId) => {
    await validateProject(projectId);
    const result = await reviewProject(projectId);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("export")
  .argument("<project-id>")
  .action(async (projectId) => {
    await validateProject(projectId);
    await exportProject(projectId);
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
