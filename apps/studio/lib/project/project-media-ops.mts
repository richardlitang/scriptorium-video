import type { Dirent, Stats } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

type PathApi = {
  basename: (path: string, suffix?: string) => string;
  extname: (path: string) => string;
  join: (...parts: string[]) => string;
  normalize: (path: string) => string;
  resolve: (...parts: string[]) => string;
  sep: string;
};

interface ProjectMediaOpsDeps {
  path: PathApi;
  readdir: (dirPath: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
  stat: (filePath: string) => Promise<Stats>;
  createReadStream: (
    filePath: string,
    options?: { start?: number; end?: number },
  ) => NodeJS.ReadableStream;
  projectsDir: string;
  sendJson: (res: ServerResponse, statusCode: number, payload: Record<string, unknown>) => void;
}

export function createProjectMediaOps(deps: ProjectMediaOpsDeps) {
  const { path, readdir, stat, createReadStream, projectsDir, sendJson } = deps;

  function safeProjectPath(projectId: string, relativeAssetPath: string): string | null {
    const projectDir = path.join(projectsDir, projectId);
    const normalized = path.normalize(relativeAssetPath);
    const absolute = path.resolve(projectDir, normalized);
    if (!absolute.startsWith(projectDir + path.sep)) return null;
    return absolute;
  }

  async function sendVideoFile(
    req: IncomingMessage,
    res: ServerResponse,
    filePath: string,
    contentType: string,
  ) {
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) {
      return sendJson(res, 404, { ok: false, message: "Render not found." });
    }

    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, {
        "accept-ranges": "bytes",
        "content-length": fileStat.size,
        "content-type": contentType,
      });
      if (req.method === "HEAD") return res.end();
      createReadStream(filePath).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { "content-range": `bytes */${fileStat.size}` });
      return res.end();
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : fileStat.size - 1;
    if (start > end || end >= fileStat.size) {
      res.writeHead(416, { "content-range": `bytes */${fileStat.size}` });
      return res.end();
    }

    res.writeHead(206, {
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
      "content-range": `bytes ${start}-${end}/${fileStat.size}`,
      "content-type": contentType,
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(filePath, { start, end }).pipe(res);
  }

  async function getRenderDetails(projectId: string) {
    const rendersDir = path.join(projectsDir, projectId, "renders");
    const entries = await readdir(rendersDir, { withFileTypes: true }).catch(() => []);
    const renderEntries = entries
      .filter(
        (entry) =>
          entry.isFile() && [".mp4", ".webm"].includes(path.extname(entry.name).toLowerCase()),
      )
      .map(async (entry) => {
        const quality = path.basename(entry.name, path.extname(entry.name));
        const fileStat = await stat(path.join(rendersDir, entry.name)).catch(() => undefined);
        return {
          quality,
          fileName: entry.name,
          updatedAt: fileStat?.mtime?.toISOString(),
          url: `/api/projects/${projectId}/renders/${encodeURIComponent(quality)}`,
        };
      });
    const renders = (await Promise.all(renderEntries)).sort((a, b) =>
      a.quality.localeCompare(b.quality),
    );
    return { renders };
  }

  return {
    safeProjectPath,
    sendVideoFile,
    getRenderDetails,
  };
}
