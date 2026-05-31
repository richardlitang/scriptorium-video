import path from "node:path";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
  [".woff", "font/woff"],
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

// SPA variant: serves assets by extension from distDir, falls back to index.html
// for any route without a known static extension (React Router / hash navigation).
export function spaAssetForPath(distDir, pathname) {
  const ext = path.extname(pathname).toLowerCase();
  const servePathname = ext && contentTypes.has(ext) ? pathname : "/index.html";
  const decodedPathname = decodeURIComponent(servePathname);
  const requestedPath = decodedPathname.replace(/^\/+/, "") || "index.html";
  const absolutePath = path.resolve(distDir, requestedPath);
  const relativePath = path.relative(distDir, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;
  const contentType =
    contentTypes.get(path.extname(absolutePath).toLowerCase()) ?? "text/html; charset=utf-8";
  return { filePath: absolutePath, contentType };
}
