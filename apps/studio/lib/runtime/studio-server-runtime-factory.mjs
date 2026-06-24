import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  appendFile,
  unlink,
  stat,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { imageReuseKey } from "../../image-cache.mjs";
import { defaultVoiceSettings, normalizeVoiceSettings } from "../../voice-settings.mjs";
import { publicAssetForPath as defaultPublicAssetForPath } from "../../static-assets.mjs";
import {
  createOpenAiPlanOrchestrator,
  planNeedsTtsRouting,
  DEFAULT_PLANNER_USER_PROMPT_TEMPLATE,
} from "../planner/openai-plan-orchestrator.mjs";
import { DEFAULT_PLANNER_SYSTEM_PROMPT } from "../planner/planner-defaults.mjs";
import { handleStudioApiRoute } from "../routes/studio-routes.mjs";
import { isOpenAiInsufficientQuotaError } from "../planner/openai-structured-output.mjs";
import { canonicalizePlanForPersistence } from "../planner/canonicalize-plan.mjs";
// Inlined from former public/modules/image-coverage.js (deleted at cutover)
function normalizeImageCoverage(value) {
  if (value === "llm" || value === "story" || value === "global") return "llm";
  if (value === "beat" || value === "999") return "beat";
  if (value === "balanced" || value === "key") return "balanced";
  return "llm";
}
import { createPlanDraftTransformer } from "../draft/plan-draft-transformer.mjs";
import { createSplitPlannerRuntime } from "../planner/split-planner-runtime.mjs";
import { createSplitPlanBuilder } from "../planner/split-plan-builder.mjs";
import { createRunStateStore } from "../project/run-state-store.mjs";
import { selectImageTargetsFromCandidates } from "../image/image-target-selection.mjs";
import {
  planNarrationHealth,
  plannerProgressLabel,
  plannerBlockingFailureMessage,
  plannerBlockingFailures,
  plannerQualityIsUsable,
  plannerQualityWarningSummary,
  plannerQualityWarnings,
} from "../planner/planner-quality.mjs";
import {
  summarizeManifestForTrace,
  summarizePlanForTrace,
  summarizeStoryInput,
  summarizeTimelineForTrace,
  summarizeVoiceSettingsForTrace,
} from "../project/trace-summaries.mjs";
import {
  imageDescriptionFromPrompt,
  imageTagsFromPrompt,
} from "../image/image-library-metadata.mjs";
import { createRunTraceStore } from "../project/run-trace-store.mjs";
import { resolveOpenAiApiKey } from "@lvstudio/core";
import { createRendererProviders, createTTSProviderRegistry } from "@lvstudio/providers";
import { createDraftAudioRunner } from "../draft/draft-audio-runner.mjs";
import { createDraftJobRunner } from "../draft/draft-job-runner.mjs";
import {
  applyDraftDefaults,
  buildPlannerStoryInput,
  isScaffoldPlaceholderPlan,
  parsePlanFromStoryInput,
  plannerSplitDecision,
  splitStoryIntoLockedUnits,
} from "../draft/draft-plan-input.mjs";
import { createProjectMutationQueue } from "../project/project-mutation-queue.mjs";
import { createStudioRuntimeConfig } from "./studio-runtime-config.mjs";
import { createVoicePreviewAndHealth } from "../tts/voice-preview-health.mjs";
import { createVoicePreviewNormalizer } from "../tts/voice-preview-normalizer.mjs";
import { createChatterboxRuntime } from "../tts/chatterbox-runtime.mjs";
import { beatJobProgress, createBeatRegenerateRunner } from "../draft/beat-regenerate-runner.mjs";
import { createImageGenerationRunner } from "../image/image-generation-runner.mjs";
import { defaultImageSizeForPlan, imageTargetsFromPlan } from "../image/image-prompting.mjs";
import { createImageCacheStore } from "../image/image-cache-store.mjs";
import { createOpenAiImageClient } from "../image/openai-image-client.mjs";
import { parseBinaryBody, parseJsonBody, sendJson } from "../routes/http-utils.mjs";
import { isDraftJobRunning, jobProgress } from "../draft/draft-job-state.mjs";
import {
  clampNumber,
  dimensionsFromSize,
  estimateDurationSeconds,
  isSafeProjectId,
  mapWithConcurrency,
  safeProjectId,
  safeVoiceReferenceFileName,
  sha256,
  sleep,
  slugify,
} from "./studio-runtime-helpers.mjs";
import { createStudioRuntimeWiring } from "./studio-runtime-wiring.mjs";
import { createVoiceSettingsStore } from "../tts/voice-settings-store.mjs";
import { createStudioOps } from "./studio-ops.mjs";
import { createStudioOpsRuntimeAdapter } from "./studio-ops-runtime-adapter.mjs";
import { createStudioDomainOps } from "./studio-domain-ops.mjs";
import { createProjectOps } from "../project/project-ops.mjs";
import { createProjectMediaOps } from "../project/project-media-ops.mjs";
import { createProjectReadOps } from "../project/project-read-ops.mjs";
import { createAgentHandoffStore } from "../project/agent-handoff-store.mjs";
import { createForegroundJobs } from "../draft/foreground-jobs.mjs";
import { createDraftStepRetrier } from "../draft/draft-step-retrier.mjs";
import { createStudioRuntime } from "./studio-runtime.mjs";
import {
  buildStudioRuntimeContextDependencies,
  buildStudioRuntimeHttpDependencies,
} from "./studio-runtime-dependencies.mjs";
import {
  assertLockedNarrationPreserved,
  fallbackMetadataForLockedSection,
  mergeSectionMetadataPlan,
} from "../planner/split-plan-metadata.mjs";

export function createStudioServerRuntime({
  rootDir,
  publicDir,
  publicAssetForPath: publicAssetForPathOverride,
  fetchImpl = fetch,
  processEnv = process.env,
}) {
  const publicAssetForPath = publicAssetForPathOverride ?? defaultPublicAssetForPath;
  const projectsDir = path.join(rootDir, "content", "projects");
  const qualityHistoryDir = path.join(rootDir, ".studio-data", "quality-history");
  const imageHistoryDir = path.join(rootDir, ".studio-data", "image-history");
  const imageCachePath = path.join(rootDir, ".studio-data", "image-cache.ndjson");
  const imageLibraryDir = path.join(rootDir, ".studio-data", "image-library");
  const voiceSettingsPath = path.join(rootDir, ".studio-data", "voice-settings.json");
  const voiceReferencesDir = path.join(rootDir, ".studio-data", "voice-references");
  const runtimeConfig = createStudioRuntimeConfig({ rootDir, env: processEnv });
  const splitPlannerConfig = {
    enabled: runtimeConfig.splitPlannerEnabled,
    minWords: runtimeConfig.splitPlannerMinWords,
    minUnits: runtimeConfig.splitPlannerMinUnits,
  };
  const runProjectMutation = createProjectMutationQueue();
  const activeDraftJobs = new Map();
  const activeBeatJobs = new Map();
  const studioOpsRuntime = createStudioOpsRuntimeAdapter();
  const MMS_HEALTH_URL = runtimeConfig.mmsHealthUrl;
  const STUDIO_TEST_MODE = runtimeConfig.studioTestMode;
  const { previewVoice, readTtsHealth, clearPreviewCache } = createVoicePreviewAndHealth({
    fetchImpl,
    env: processEnv,
    chatterboxSpeechUrl: runtimeConfig.chatterboxSpeechUrl,
    chatterboxHealthUrl: runtimeConfig.chatterboxHealthUrl,
    studioTestMode: STUDIO_TEST_MODE,
    normalizePreviewAudio: createVoicePreviewNormalizer(),
  });
  const { ensureChatterboxReady, warmChatterbox, resetStartState } = createChatterboxRuntime({
    readTtsHealth,
    spawnImpl: spawn,
    sleepImpl: sleep,
    env: processEnv,
    rootDir,
    autoStartEnabled: runtimeConfig.chatterboxAutoStartEnabled,
    startCommand: runtimeConfig.chatterboxStartCommand,
    startTimeoutMs: runtimeConfig.chatterboxStartTimeoutMs,
    studioTestMode: STUDIO_TEST_MODE,
  });
  const port = runtimeConfig.port;
  const { runStatePath, readRunState, writeRunState, upsertRunJob, updateRunProgress } =
    createRunStateStore(rootDir);
  const { runTraceDisplayPath, appendRunTrace, readRunTrace } = createRunTraceStore(rootDir);
  const { writeAgentHandoff } = createAgentHandoffStore(rootDir);
  const { buildPlanFromAiDraft } = createPlanDraftTransformer({
    slugify,
    estimateDurationSeconds,
    clampNumber,
  });
  const { buildLockedPlanFromStory } = createSplitPlanBuilder({
    splitStoryIntoLockedUnits,
    splitPlannerBeatsPerSection: runtimeConfig.splitPlannerBeatsPerSection,
    splitPlannerMaxSections: runtimeConfig.splitPlannerMaxSections,
    slugify,
    estimateDurationSeconds,
  });

  async function getOpenAiApiKey() {
    return resolveOpenAiApiKey({ rootDir, env: processEnv });
  }

  const studioTtsProviders = createTTSProviderRegistry(
    {
      mms: runtimeConfig.mmsTtsConfig,
      openai: { ...runtimeConfig.openAiTtsConfig, getApiKey: getOpenAiApiKey },
    },
    { fetchImpl },
  );
  const studioRendererProviders = createRendererProviders({
    remotion: runtimeConfig.remotionRendererConfig,
  });

  const { generatePlanDraftWithOpenAi, routePlanTtsWithOpenAi } = createOpenAiPlanOrchestrator({
    fetchImpl,
    getOpenAiApiKey,
    buildPlanFromAiDraft,
    studioTestMode: STUDIO_TEST_MODE,
    openAiResponsesUrl: runtimeConfig.openAiResponsesUrl,
    plannerRequestConfig: runtimeConfig.plannerRequestConfig,
    ttsRoutingConfig: runtimeConfig.ttsRoutingConfig,
  });
  const generateImageWithOpenAi = createOpenAiImageClient({
    fetchImpl,
    getOpenAiApiKey,
    openAiImagesUrl: runtimeConfig.openAiImagesUrl,
    openAiImageModel: runtimeConfig.openAiImageModel,
  });

  const {
    safeReadJson,
    readMmsHealth,
    readOptionalFile,
    restoreOptionalFile,
    readProjectTraceSnapshot,
    writeDraftJobState,
    appendDraftTraceAndState,
  } = createStudioRuntimeWiring({
    fetchImpl,
    mmsHealthUrl: MMS_HEALTH_URL,
    readFile,
    unlink,
    writeFile,
    pathImpl: path,
    projectsDir,
    summarizePlanForTrace,
    summarizeManifestForTrace,
    summarizeTimelineForTrace,
    appendRunTrace,
    upsertRunJob,
  });

  const { readVoiceSettings, writeVoiceSettings } = createVoiceSettingsStore({
    safeReadJson,
    normalizeVoiceSettings,
    defaultVoiceSettings,
    voiceSettingsPath,
    pathImpl: path,
  });

  const imageCacheStore = createImageCacheStore({
    path,
    rootDir,
    imageHistoryDir,
    imageCachePath,
    imageLibraryDir,
    imageReuseKey,
    imageDescriptionFromPrompt,
    imageTagsFromPrompt,
    sha256,
    safeReadJson,
    readFile,
    readdir,
    stat,
    appendFile,
    mkdir,
    writeFile,
  });
  const {
    readImageHistory,
    appendImageHistory,
    findReusableImage,
    appendImageCacheEntry,
    storeImageInLibrary,
  } = imageCacheStore;
  const appendQualityHistory = (projectId, entry) =>
    studioOpsRuntime.appendQualityHistory(projectId, entry);
  const domainOps = createStudioDomainOps({
    rootDir,
    ttsProviderRegistry: studioTtsProviders,
    rendererProviderRegistry: studioRendererProviders,
    readVoiceSettingsImpl: readVoiceSettings,
    processEnv,
  });

  const { getProjectDetails } = createProjectReadOps({
    path,
    projectsDir,
    safeReadJson,
    readRunState,
    readFile,
    sha256,
  });

  const imageGenerationRunner = createImageGenerationRunner({
    path,
    projectsDir,
    safeReadJson,
    readImageHistory,
    normalizeImageCoverage,
    defaultImageSizeForPlan,
    imageTargetsFromPlan,
    selectImageTargetsFromCandidates,
    mkdir,
    updateRunProgress,
    mapWithConcurrency,
    sha256,
    imageReuseKey,
    findReusableImage,
    readFile,
    writeFile,
    generateImageWithOpenAi,
    storeImageInLibrary,
    dimensionsFromSize,
    appendImageHistory,
    appendImageCacheEntry,
    domainOps,
    appendQualityHistory,
  });
  const selectImageTargets = imageGenerationRunner.selectImageTargets;
  const generateProjectImages = (projectId, options = {}) =>
    imageGenerationRunner.generateProjectImages(projectId, {
      imageConcurrency: runtimeConfig.imageConcurrency,
      openAiImageModel: runtimeConfig.openAiImageModel,
      ...options,
    });
  const runBeatRegenerateJob = createBeatRegenerateRunner({
    activeBeatJobs,
    getProjectDetails,
    upsertRunJob,
    runProjectMutation,
    domainOps,
    generateProjectImages,
    defaultImageSizeForPlan,
    appendQualityHistory,
  });

  const runRetriedDraftStep = createDraftStepRetrier({
    ensureChatterboxReady,
    appendRunTrace,
    writeDraftJobState,
    sleep,
  });
  const generateDraftAudioBySection = createDraftAudioRunner({
    readVoiceSettings,
    appendRunTrace,
    summarizeVoiceSettingsForTrace,
    ensureChatterboxReady,
    readMmsHealth,
    getOpenAiApiKey,
    writeDraftJobState,
    runRetriedDraftStep,
    domainOps,
    readProjectTraceSnapshot,
  });

  const {
    plannerProgressTracer,
    stricterPlannerUserPromptTemplate,
    splitPlannerEnabled,
    generateSplitPlanDraftWithOpenAi,
  } = createSplitPlannerRuntime({
    plannerSplitDecision,
    splitPlannerConfig,
    defaultPlannerUserPromptTemplate: DEFAULT_PLANNER_USER_PROMPT_TEMPLATE,
    appendDraftTraceAndState,
    plannerProgressLabel,
    buildLockedPlanFromStory,
    appendRunTrace,
    splitPlannerSectionAttempts: runtimeConfig.splitPlannerSectionAttempts,
    generatePlanDraftWithOpenAi,
    isOpenAiInsufficientQuotaError,
    sleep,
    fallbackMetadataForLockedSection,
    mergeSectionMetadataPlan,
    planNarrationHealth,
    assertLockedNarrationPreserved,
  });

  const runDraftJob = createDraftJobRunner({
    runTraceDisplayPath,
    activeDraftJobs,
    writeDraftJobState,
    appendRunTrace,
    normalizeImageCoverage,
    summarizeVoiceSettingsForTrace,
    readVoiceSettings,
    runProjectMutation,
    path,
    projectsDir,
    getProjectDetails,
    summarizeStoryInput,
    summarizePlanForTrace,
    parsePlanFromStoryInput,
    applyDraftDefaults,
    buildPlannerStoryInput,
    splitStoryIntoLockedUnits,
    plannerSplitDecision,
    splitPlannerConfig,
    generateSplitPlanDraftWithOpenAi,
    generatePlanDraftWithOpenAi,
    planNarrationHealth,
    plannerQualityWarnings,
    plannerQualityWarningSummary,
    plannerQualityIsUsable,
    plannerBlockingFailures,
    plannerBlockingFailureMessage,
    stricterPlannerUserPromptTemplate,
    plannerProgressTracer,
    canonicalizePlanForPersistence,
    writeFile,
    planNeedsTtsRouting,
    routePlanTtsWithOpenAi,
    ensureChatterboxReady,
    readMmsHealth,
    getOpenAiApiKey,
    runRetriedDraftStep,
    domainOps,
    readProjectTraceSnapshot,
    safeReadJson,
    selectImageTargets,
    defaultImageSizeForPlan,
    summarizeManifestForTrace,
    generateProjectImages,
    generateDraftAudioBySection,
    sha256,
    readFile,
    appendQualityHistory,
    upsertRunJob,
    jobProgress,
    writeRunState,
    readRunState,
    writeAgentHandoff,
  });

  const projectOps = createProjectOps({
    path,
    readdir,
    stat,
    rm,
    readFile,
    writeFile,
    safeReadJson,
    projectsDir,
    qualityHistoryDir,
    imageHistoryDir,
    runStatePath,
    domainOps,
    appendQualityHistory,
    readRunState,
    activeDraftJobs,
    activeBeatJobs,
    jobProgress,
    beatJobProgress,
    sha256,
  });
  const {
    deleteProjectAsset,
    updateProjectAssetStatus,
    readQualityHistory,
    listDraftJobs,
    listProjects,
    projectDeleteBlocker,
    deleteProject,
  } = projectOps;
  const { safeProjectPath, sendVideoFile, getRenderDetails } = createProjectMediaOps({
    path,
    readdir,
    stat,
    createReadStream,
    projectsDir,
    sendJson,
  });
  const { runTrackedForegroundJob } = createForegroundJobs({ upsertRunJob, writeAgentHandoff });

  studioOpsRuntime.setRuntime(
    createStudioOps({
      path,
      mkdir,
      appendFile,
      qualityHistoryDir,
    }),
  );

  const { handleStudioHttpRequest } = createStudioRuntime({
    contextDependencies: buildStudioRuntimeContextDependencies({
      sendJson,
      parseJsonBody,
      parseBinaryBody,
      readVoiceSettings,
      writeVoiceSettings,
      readTtsHealth,
      previewVoice,
      safeVoiceReferenceFileName,
      voiceReferencesDir,
      mkdir,
      path,
      writeFile,
      DEFAULT_PLANNER_SYSTEM_PROMPT,
      DEFAULT_PLANNER_USER_PROMPT_TEMPLATE,
      listProjects,
      safeProjectId,
      projectsDir,
      stat,
      domainOps,
      safeReadJson,
      projectDeleteBlocker,
      deleteProject,
      getProjectDetails,
      readFile,
      readOptionalFile,
      restoreOptionalFile,
      runTrackedForegroundJob,
      appendQualityHistory,
      readRunState,
      writeRunState,
      sha256,
      splitPlannerEnabled,
      generateSplitPlanDraftWithOpenAi,
      generatePlanDraftWithOpenAi,
      runProjectMutation,
      deleteProjectAsset,
      updateProjectAssetStatus,
      readImageHistory,
      generateProjectImages,
      activeBeatJobs,
      beatJobProgress,
      runBeatRegenerateJob,
      getRenderDetails,
      sendVideoFile,
      safeProjectPath,
      readQualityHistory,
      listDraftJobs,
      readRunTrace,
      activeDraftJobs,
      jobProgress,
      isDraftJobRunning,
      appendRunTrace,
      writeDraftJobState,
      process,
      isScaffoldPlaceholderPlan,
      runDraftJob,
    }),
    httpDependencies: buildStudioRuntimeHttpDependencies({
      port,
      publicDir,
      readFile,
      sendJson,
      handleStudioApiRoute,
      publicAssetForPath,
      isSafeProjectId,
    }),
  });

  return {
    port,
    handleStudioHttpRequest,
    warmChatterbox,
    dispose() {
      clearPreviewCache();
      resetStartState();
    },
  };
}
