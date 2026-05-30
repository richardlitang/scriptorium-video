import { badRequest, dispatchRoute, parseProjectPath } from "./route-utils.mjs";
import { requireRouteContext } from "./route-context.mjs";
import { canonicalizePlanForPersistence } from "../planner/canonicalize-plan.mjs";

export const PROJECT_CRUD_ROUTE_KEYS = [
  "sendJson",
  "parseJsonBody",
  "listProjects",
  "safeProjectId",
  "projectsDir",
  "path",
  "stat",
  "runLvstudio",
  "safeReadJson",
  "writeFile",
  "projectDeleteBlocker",
  "deleteProject",
  "getProjectDetails",
];

export async function handleProjectCrudRoutes(context, req, res, pathname) {
  requireRouteContext(context, "project crud routes", PROJECT_CRUD_ROUTE_KEYS);
  const {
    sendJson,
    parseJsonBody,
    listProjects,
    safeProjectId,
    projectsDir,
    path,
    stat,
    runLvstudio,
    safeReadJson,
    writeFile,
    projectDeleteBlocker,
    deleteProject,
    getProjectDetails,
  } = context;

  const routes = [
    {
      method: "GET",
      match: (nextPath) => (nextPath === "/api/projects" ? {} : null),
      handle: async () => {
        sendJson(res, 200, { ok: true, data: { projects: await listProjects() } });
        return true;
      },
    },
    {
      method: "POST",
      match: (nextPath) => (nextPath === "/api/projects" ? {} : null),
      handle: async () => {
        const body = await parseJsonBody(req);
        const title = String(body.title || "Untitled Story").trim();
        const projectId = safeProjectId(body.id || title);
        if (!projectId) {
          sendJson(res, 400, { ok: false, message: "Project title or id is required." });
          return true;
        }
        const projectDir = path.join(projectsDir, projectId);
        if (await stat(projectDir).catch(() => null)) {
          sendJson(res, 409, { ok: false, message: `Project already exists: ${projectId}` });
          return true;
        }
        const mode = body.mode || "long_documentary";
        const platform = body.platform || "local_only";
        await runLvstudio(["create", projectId, "--mode", mode, "--platform", platform]);
        const projectPath = path.join(projectDir, "project.json");
        const planPath = path.join(projectDir, "video-plan.json");
        const [project, plan] = await Promise.all([
          safeReadJson(projectPath),
          safeReadJson(planPath),
        ]);
        project.title = title;
        project.updatedAt = new Date().toISOString();
        plan.title = title;
        plan.providers = { ...plan.providers, tts: "chatterbox", transcription: "mock" };
        plan.voice = {
          ...plan.voice,
          provider: "chatterbox",
          voiceId: "clone",
          format: "wav",
          options: {
            speed: 0.92,
            emotion:
              "Narrate as an engaged suspense storyteller: intimate, alert, and controlled. Build intrigue from the first line, sharpen the turns, slow slightly on dread, and avoid sounding bored, detached, cheerful, or theatrical.",
          },
        };
        const canonicalPlan = canonicalizePlanForPersistence(plan);
        await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
        await writeFile(planPath, `${JSON.stringify(canonicalPlan, null, 2)}\n`, "utf8");
        await runLvstudio(["sync", projectId]);
        sendJson(res, 201, { ok: true, message: "Project created.", data: { projectId } });
        return true;
      },
    },
    {
      method: "DELETE",
      match: (nextPath) => (nextPath === "/api/projects" ? {} : null),
      handle: async () => {
        const body = await parseJsonBody(req);
        if (body.confirm !== "DELETE ALL PROJECTS") {
          sendJson(res, 400, {
            ok: false,
            message: "Bulk project deletion requires confirmation.",
          });
          return true;
        }
        const projects = await listProjects();
        for (const project of projects) {
          const blocker = projectDeleteBlocker(project.id);
          if (blocker) {
            sendJson(res, 409, {
              ok: false,
              message: `Cannot delete all projects because ${project.id} cannot be deleted. ${blocker}`,
            });
            return true;
          }
        }
        for (const project of projects) await deleteProject(project.id);
        sendJson(res, 200, {
          ok: true,
          message: "All projects deleted.",
          data: { deletedProjectIds: projects.map((project) => project.id) },
        });
        return true;
      },
    },
    {
      method: "GET",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        sendJson(res, 200, { ok: true, data: await getProjectDetails(projectId) });
        return true;
      },
    },
    {
      method: "DELETE",
      match: (nextPath) => {
        const parsed = parseProjectPath(nextPath);
        return parsed && parsed.tail === "" ? { projectId: parsed.projectId } : null;
      },
      handle: async ({ projectId }) => {
        if (!projectId) return badRequest(res, sendJson, "Missing project id.");
        const blocker = projectDeleteBlocker(projectId);
        if (blocker) {
          sendJson(res, 409, { ok: false, message: blocker });
          return true;
        }
        await deleteProject(projectId);
        sendJson(res, 200, { ok: true, message: "Project deleted.", data: { projectId } });
        return true;
      },
    },
  ];

  return dispatchRoute(routes, req, pathname, context);
}
