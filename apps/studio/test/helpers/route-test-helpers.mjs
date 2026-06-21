import path from "node:path";
import { PROJECT_ROUTE_KEYS } from "../../lib/routes/routes-projects.mjs";
import { ASSET_ROUTE_KEYS } from "../../lib/routes/routes-assets.mjs";
import { JOB_ROUTE_KEYS } from "../../lib/routes/routes-jobs.mjs";
import { STUDIO_ROUTE_CONTEXT_KEYS } from "../../lib/routes/studio-routes.mjs";

export function makeJsonResponder() {
  const response = { status: 0, body: null, headers: null, endBody: null };
  const res = {
    writeHead(status, headers = {}) {
      response.status = status;
      response.headers = headers;
    },
    end(body) {
      response.endBody = body;
    },
  };
  return {
    res,
    response,
    sendJson(_res, status, body) {
      response.status = status;
      response.body = body;
    },
  };
}

export function makeProjectContext(overrides = {}) {
  const base = Object.fromEntries(PROJECT_ROUTE_KEYS.map((key) => [key, async () => ({})]));
  base.sendJson = () => {};
  base.path = path;
  base.projectsDir = "/tmp/projects";
  base.parseJsonBody = async () => ({});
  base.listProjects = async () => [];
  base.safeProjectId = (value) => String(value || "");
  base.stat = async () => null;
  base.runLvstudio = async () => ({ stdout: "", ok: true });
  base.safeReadJson = async () => ({});
  base.writeFile = async () => {};
  base.projectDeleteBlocker = () => "";
  base.deleteProject = async () => {};
  base.getProjectDetails = async () => ({});
  base.readFile = async () => "";
  base.readOptionalFile = async () => null;
  base.restoreOptionalFile = async () => {};
  base.runTrackedForegroundJob = async (_projectId, _job, worker) =>
    worker({ advance: async (_label, fn) => fn() });
  base.appendQualityHistory = async () => {};
  base.domainOps = {
    createProject: async () => {},
    sync: async () => ({}),
    check: async () => ({}),
    review: async () => ({}),
  };
  base.readRunState = async () => ({});
  base.writeRunState = async () => {};
  base.sha256 = async () => "hash";
  base.splitPlannerEnabled = () => false;
  base.generateSplitPlanDraftWithOpenAi = async () => ({});
  base.generatePlanDraftWithOpenAi = async () => ({});
  base.runProjectMutation = async (_id, fn) => fn();
  base.getRenderDetails = async () => ({ renders: [] });
  base.sendVideoFile = async () => {};
  base.safeProjectPath = () => null;
  base.runLvstudioReport = async () => ({ ok: true, stdout: "{}" });
  base.readQualityHistory = async () => [];
  return { ...base, ...overrides };
}

export function makeAssetContext(overrides = {}) {
  const base = Object.fromEntries(ASSET_ROUTE_KEYS.map((key) => [key, async () => ({})]));
  base.sendJson = () => {};
  base.parseJsonBody = async () => ({});
  base.projectsDir = "/tmp/projects";
  base.path = path;
  base.safeReadJson = async () => ({ assets: [] });
  base.runProjectMutation = async (_id, fn) => fn();
  base.deleteProjectAsset = async () => ({});
  base.updateProjectAssetStatus = async () => ({});
  base.readImageHistory = async () => [];
  base.generateProjectImages = async () => ({ generated: [] });
  base.activeBeatJobs = new Map();
  base.beatJobProgress = (job) => job;
  base.runBeatRegenerateJob = async () => ({});
  return { ...base, ...overrides };
}

export function makeJobContext(overrides = {}) {
  const base = Object.fromEntries(JOB_ROUTE_KEYS.map((key) => [key, async () => ({})]));
  base.sendJson = () => {};
  base.parseJsonBody = async () => ({});
  base.listDraftJobs = async () => [];
  base.readRunTrace = async () => ({});
  base.activeDraftJobs = new Map();
  base.jobProgress = (job) => job;
  base.readRunState = async () => ({});
  base.isDraftJobRunning = () => false;
  base.appendRunTrace = async () => {};
  base.writeDraftJobState = async () => {};
  base.process = process;
  base.isScaffoldPlaceholderPlan = () => false;
  base.getProjectDetails = async () => ({ plan: {} });
  base.runDraftJob = async () => ({});
  base.runProjectMutation = async (_id, fn) => fn();
  base.runTrackedForegroundJob = async () => ({});
  base.domainOps = {
    check: async () => ({}),
    review: async () => ({}),
  };
  base.runLvstudio = async () => ({});
  base.runLvstudioReport = async () => ({});
  base.appendQualityHistory = async () => {};
  base.writeRunState = async () => {};
  base.path = path;
  base.projectsDir = "/tmp/projects";
  base.readFile = async () => "";
  base.sha256 = () => "hash";
  return { ...base, ...overrides };
}

export function makeStudioBaseContext(overrides = {}) {
  const base = Object.fromEntries(STUDIO_ROUTE_CONTEXT_KEYS.map((key) => [key, async () => ({})]));
  const merged = {
    ...base,
    ...makeProjectContext(),
    ...makeAssetContext(),
    ...makeJobContext(),
    sendJson: () => {},
    parseBinaryBody: async () => Buffer.alloc(0),
    readVoiceSettings: async () => ({}),
    writeVoiceSettings: async () => ({}),
    readTtsHealth: async () => ({}),
    previewVoice: async () => Buffer.alloc(0),
    safeVoiceReferenceFileName: (value) => value,
    voiceReferencesDir: "/tmp",
    mkdir: async () => {},
    DEFAULT_PLANNER_SYSTEM_PROMPT: "system",
    DEFAULT_PLANNER_USER_PROMPT_TEMPLATE: "template",
  };
  return { ...merged, ...overrides };
}
