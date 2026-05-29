export function createStudioHttpHandler({
  port,
  publicDir,
  readFile,
  sendJson,
  handleStudioApiRoute,
  publicAssetForPath,
  isSafeProjectId,
  studioApiContext,
}) {
  return async function handleStudioHttpRequest(req, res) {
    const requestUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = requestUrl.pathname;
    const apiProjectId = pathname.startsWith("/api/projects/") ? pathname.split("/")[3] : "";
    if (apiProjectId && !isSafeProjectId(apiProjectId)) {
      return sendJson(res, 400, { ok: false, message: "Invalid project id." });
    }

    try {
      const handledApiRoute = await handleStudioApiRoute(
        studioApiContext,
        req,
        res,
        pathname,
        requestUrl,
      );
      if (handledApiRoute) return;
      if (pathname.startsWith("/api/")) {
        return sendJson(res, 404, { ok: false, message: "Not found." });
      }

      const staticAsset = publicAssetForPath(publicDir, pathname);
      if (staticAsset) {
        const content = await readFile(staticAsset.filePath).catch(() => null);
        if (!content) return sendJson(res, 404, { ok: false, message: "Not found." });
        res.writeHead(200, { "content-type": staticAsset.contentType });
        res.end(content);
        return;
      }

      sendJson(res, 404, { ok: false, message: "Not found." });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown server error.",
      });
    }
  };
}
