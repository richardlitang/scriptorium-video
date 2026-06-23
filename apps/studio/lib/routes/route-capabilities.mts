import type { StudioDomainOps } from "../runtime/studio-domain-ops.mjs";

export const HTTP_CAPABILITY_KEYS = ["sendJson", "parseJsonBody", "parseBinaryBody"] as const;

export const PROJECTS_CAPABILITY_KEYS = [
  "listProjects",
  "safeProjectId",
  "projectsDir",
  "path",
  "stat",
  "safeReadJson",
  "writeFile",
  "projectDeleteBlocker",
  "deleteProject",
  "getProjectDetails",
  "readFile",
  "readOptionalFile",
  "restoreOptionalFile",
  "sha256",
  "splitPlannerEnabled",
  "generateSplitPlanDraftWithOpenAi",
  "generatePlanDraftWithOpenAi",
  "getRenderDetails",
  "sendVideoFile",
  "safeProjectPath",
  "runProjectMutation",
  "deleteProjectAsset",
  "updateProjectAssetStatus",
  "readImageHistory",
  "generateProjectImages",
] as const;

export const JOBS_CAPABILITY_KEYS = [
  "runTrackedForegroundJob",
  "activeBeatJobs",
  "beatJobProgress",
  "runBeatRegenerateJob",
  "listDraftJobs",
  "activeDraftJobs",
  "jobProgress",
  "isDraftJobRunning",
  "process",
  "isScaffoldPlaceholderPlan",
  "runDraftJob",
  "projectsDir",
  "path",
  "readFile",
  "sha256",
  "getProjectDetails",
  "runProjectMutation",
] as const;

export const TRACES_CAPABILITY_KEYS = [
  "appendQualityHistory",
  "readQualityHistory",
  "readRunState",
  "writeRunState",
  "readRunTrace",
  "appendRunTrace",
  "writeDraftJobState",
] as const;

export const VOICE_CAPABILITY_KEYS = [
  "readVoiceSettings",
  "writeVoiceSettings",
  "readTtsHealth",
  "previewVoice",
  "safeVoiceReferenceFileName",
  "voiceReferencesDir",
  "mkdir",
  "path",
  "writeFile",
  "DEFAULT_PLANNER_SYSTEM_PROMPT",
  "DEFAULT_PLANNER_USER_PROMPT_TEMPLATE",
] as const;

type CapabilityFor<TKeys extends readonly string[]> = {
  [TKey in TKeys[number]]: unknown;
};

export type HttpCapability = CapabilityFor<typeof HTTP_CAPABILITY_KEYS>;
export type ProjectsCapability = CapabilityFor<typeof PROJECTS_CAPABILITY_KEYS>;
export type JobsCapability = CapabilityFor<typeof JOBS_CAPABILITY_KEYS>;
export type TracesCapability = CapabilityFor<typeof TRACES_CAPABILITY_KEYS>;
export type VoiceCapability = CapabilityFor<typeof VOICE_CAPABILITY_KEYS>;
export type DomainOpsCapability = StudioDomainOps;

export type StudioRouteCapabilities = {
  http: HttpCapability;
  projects: ProjectsCapability;
  jobs: JobsCapability;
  traces: TracesCapability;
  voice: VoiceCapability;
  domainOps: DomainOpsCapability;
};

function pickCapability<const TKeys extends readonly string[]>(
  dependencies: Record<string, unknown>,
  keys: TKeys,
): CapabilityFor<TKeys> {
  return Object.fromEntries(keys.map((key) => [key, dependencies[key]])) as CapabilityFor<TKeys>;
}

export function createRouteCapabilities(
  dependencies: Record<string, unknown>,
): StudioRouteCapabilities {
  return {
    http: pickCapability(dependencies, HTTP_CAPABILITY_KEYS),
    projects: pickCapability(dependencies, PROJECTS_CAPABILITY_KEYS),
    jobs: pickCapability(dependencies, JOBS_CAPABILITY_KEYS),
    traces: pickCapability(dependencies, TRACES_CAPABILITY_KEYS),
    voice: pickCapability(dependencies, VOICE_CAPABILITY_KEYS),
    domainOps: dependencies.domainOps as DomainOpsCapability,
  };
}
