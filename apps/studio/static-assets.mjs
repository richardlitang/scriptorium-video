import path from "node:path";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"]
]);

export function publicAssetForPath(publicDir, pathname) {
  const normalizedPathname = pathname === "/" ? "/index.html" : pathname;
  const decodedPathname = decodeURIComponent(normalizedPathname);
  const requestedPath = decodedPathname.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicDir, requestedPath);
  const relativePath = path.relative(publicDir, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;
  const contentType = contentTypes.get(path.extname(absolutePath).toLowerCase());
  if (!contentType) return undefined;
  return { filePath: absolutePath, contentType };
}
