import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const projectsDir = path.join(rootDir, "content", "projects");

const port = Number(process.env.PORT ?? "4173");

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function safeReadJson(jsonPath) {
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

async function listProjects() {
  const entries = await readdir(projectsDir, { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    try {
      const project = await safeReadJson(path.join(projectsDir, id, "project.json"));
      const plan = await safeReadJson(path.join(projectsDir, id, "video-plan.json"));
      projects.push({
        id: project.id,
        title: project.title,
        status: project.status,
        mode: plan.mode,
        targetPlatform: plan.targetPlatform,
        updatedAt: project.updatedAt
      });
    } catch {
      // Skip invalid project folders.
    }
  }
  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

async function runLvstudio(args) {
  const { stdout, stderr } = await execFileAsync("pnpm", ["lvstudio", ...args], { cwd: rootDir });
  return { stdout, stderr };
}

async function getProjectDetails(projectId) {
  const base = path.join(projectsDir, projectId);
  const [project, plan, timeline, manifest, captions] = await Promise.all([
    safeReadJson(path.join(base, "project.json")),
    safeReadJson(path.join(base, "video-plan.json")),
    safeReadJson(path.join(base, "timeline.json")).catch(() => undefined),
    safeReadJson(path.join(base, "asset-manifest.json")).catch(() => ({ assets: [] })),
    safeReadJson(path.join(base, "captions", "captions.json")).catch(() => ({ captions: [] }))
  ]);
  return {
    project,
    plan,
    timeline,
    assetCount: manifest.assets?.length ?? 0,
    captionCount: captions.captions?.length ?? 0
  };
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
  const pathname = requestUrl.pathname;

  try {
    if (pathname === "/api/projects" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, projects: await listProjects() });
    }

    if (pathname.startsWith("/api/projects/") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Missing project id." });
      return sendJson(res, 200, { ok: true, data: await getProjectDetails(projectId) });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/quality") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const result = await runLvstudio(["check", projectId]);
      return sendJson(res, 200, { ok: true, output: result.stdout.trim() });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/render") && req.method === "POST") {
      const projectId = pathname.split("/")[3];
      const quality = requestUrl.searchParams.get("quality") === "final" ? "final" : "draft";
      const result = await runLvstudio(["render", projectId, "--quality", quality]);
      return sendJson(res, 200, { ok: true, output: result.stdout.trim() });
    }

    if (pathname === "/" || pathname === "/index.html") {
      const html = await readFile(path.join(publicDir, "index.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (pathname === "/app.js") {
      const js = await readFile(path.join(publicDir, "app.js"), "utf8");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(js);
      return;
    }

    if (pathname === "/styles.css") {
      const css = await readFile(path.join(publicDir, "styles.css"), "utf8");
      res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      res.end(css);
      return;
    }

    sendJson(res, 404, { ok: false, message: "Not found." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : "Unknown server error." });
  }
});

server.listen(port, () => {
  console.log(`Studio running at http://localhost:${port}`);
});
