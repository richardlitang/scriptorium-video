import type { IncomingMessage } from "node:http";

type RouteHandlerContext = {
  req: IncomingMessage;
  pathname: string;
};

type PathModule = {
  extname(filePath: string): string;
};

type RouteDefinition<TParams = unknown, TContext = unknown> = {
  method?: string;
  match(pathname: string): TParams | null;
  handle(params: TParams, context: TContext): Promise<boolean> | boolean;
};

export function projectIdFromPathname(pathname: string | undefined | null): string {
  const parts = String(pathname || "").split("/");
  return parts[3] || "";
}

export function parseProjectPath(
  pathname: string | undefined | null,
): { projectId: string; tail: string } | null {
  const match = /^\/api\/projects\/([^/]+)(?:\/(.*))?$/.exec(String(pathname || ""));
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1] || ""),
    tail: match[2] || "",
  };
}

export function hasProjectTail(pathname: string | undefined | null, tail: string): boolean {
  const parsed = parseProjectPath(pathname);
  return Boolean(parsed && parsed.tail === tail);
}

export function badRequest<TResponse>(
  res: TResponse,
  sendJson: (res: TResponse, status: number, payload: { ok: false; message: string }) => void,
  message: string,
): true {
  sendJson(res, 400, { ok: false, message });
  return true;
}

export function mediaMimeForPath(path: PathModule, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

export async function dispatchRoute<TParams, TContext extends RouteHandlerContext>(
  routeTable: RouteDefinition<TParams, TContext>[],
  req: IncomingMessage,
  pathname: string,
  handlerContext: TContext,
): Promise<boolean> {
  for (const route of routeTable) {
    if (route.method !== req.method) continue;
    const params = route.match(pathname);
    if (!params) continue;
    return route.handle(params, handlerContext);
  }
  return false;
}
