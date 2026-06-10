import { badRequest, dispatchRoute, parseProjectPath } from "./route-utils.mjs";
import { requireRouteContext } from "./route-context.mjs";
import { canonicalizePlanForPersistence } from "../planner/canonicalize-plan.mjs";
import { buildPlannerStoryInput } from "../draft/draft-plan-input.mts";

export const PROJECT_PLAN_ROUTE_KEYS = [
  "sendJson",
  "parseJsonBody",
  "projectsDir",
  "path",
  "readFile",
  "readOptionalFile",
  "restoreOptionalFile",
  "writeFile",
  "runTrackedForegroundJob",
  "runLvstudio",
  "appendQualityHistory",
  "readRunState",
  "writeRunState",
  "sha256",
  "getProjectDetails",
  "splitPlannerEnabled",
  "generateSplitPlanDraftWithOpenAi",
  "generatePlanDraftWithOpenAi",
];

export async function handleProjectPlanRoutes(context, req, res, pathname, requestUrl) {
  requireRouteContext(context, "project plan routes", PROJECT_PLAN_ROUTE_KEYS);
  const {
    sendJson,
    parseJsonBody,
    projectsDir,
    path,
    readFile,
    readOptionalFile,
    restoreOptionalFile,
    writeFile,
    runTrackedForegroundJob,
    runLvstudio,
    appendQualityHistory,
    readRunState,
    writeRunState,
    sha256,
    getProjectDetails,
    splitPlannerEnabled,
    generateSplitPlanDraftWithOpenAi,
    generatePlanDraftWithOpenAi,
  } = context;

  const routes = [
    {
      method: "PUT",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "plan" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const projectDir = path.join(projectsDir, projectId);
        const planPath = path.join(projectDir, "video-plan.json");
        const timelinePath = path.join(projectDir, "timeline.json");
        const manifestPath = path.join(projectDir, "asset-manifest.json");
        const current = await readFile(planPath, "utf8");
        const currentTimeline = await readOptionalFile(timelinePath);
        const currentManifest = await readOptionalFile(manifestPath);
        const nextPlan = canonicalizePlanForPersistence(await parseJsonBody(req));
        await writeFile(planPath, `${JSON.stringify(nextPlan, null, 2)}\n`, "utf8");
        try {
          const skipCheck = requestUrl.searchParams.get("check") === "false";
          const { syncResult, checkResult } = await runTrackedForegroundJob(
            projectId,
            {
              kind: "plan_save_job",
              label: "Saving plan",
              total: skipCheck ? 1 : 2,
              completedLabel: "Plan saved",
            },
            async ({ advance }) => {
              const syncResult = await advance("Syncing plan", () =>
                runLvstudio(["sync", projectId]),
              );
              const checkResult = skipCheck
                ? undefined
                : await advance("Running plan check", () => runLvstudio(["check", projectId]));
              return { syncResult, checkResult };
            },
          );
          const output = [syncResult.stdout.trim(), checkResult?.stdout.trim()]
            .filter(Boolean)
            .join("\n\n");
          await appendQualityHistory(projectId, {
            timestamp: new Date().toISOString(),
            kind: "plan_save",
            summary: skipCheck
              ? "Plan updated in Studio UI without readiness check."
              : "Plan updated in Studio UI.",
            output,
          });
          const previousRunState = await readRunState(projectId);
          await writeRunState(projectId, {
            ...previousRunState,
            status: "idle",
            currentPlanHash: await sha256(await readFile(planPath, "utf8")),
            updatedAt: new Date().toISOString(),
          });
          sendJson(res, 200, { ok: true, message: "Plan saved.", data: { output } });
        } catch (error) {
          await writeFile(planPath, current, "utf8");
          await restoreOptionalFile(timelinePath, currentTimeline);
          await restoreOptionalFile(manifestPath, currentManifest);
          throw error;
        }
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "plan-from-story" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const body = await parseJsonBody(req);
        if (!body.story || typeof body.story !== "string") {
          sendJson(res, 400, { ok: false, message: "Story text is required." });
          return true;
        }
        const details = await getProjectDetails(projectId);
        const plannerStory = buildPlannerStoryInput(body.story);
        const plannerInput = {
          story: plannerStory,
          currentPlan: details.plan,
          feel: body.feel ?? "",
          pacing: body.pacing ?? "",
          visualStyle: body.visualStyle ?? "",
          format: body.format ?? "long_documentary",
          systemPrompt: body.systemPrompt,
          userPromptTemplate: body.userPromptTemplate,
        };
        const result = splitPlannerEnabled(body, body.story)
          ? await generateSplitPlanDraftWithOpenAi({ ...plannerInput, story: body.story })
          : await generatePlanDraftWithOpenAi(plannerInput);
        sendJson(res, 200, { ok: true, message: "AI video plan generated.", data: result });
        return true;
      },
    },
  ];

  return dispatchRoute(routes, req, pathname, context);
}
