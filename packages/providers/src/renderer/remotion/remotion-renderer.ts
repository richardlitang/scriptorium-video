import { createReadStream } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path, { extname } from "node:path";
import type { RenderRequest, RenderResult, RendererProvider } from "@lvstudio/core";

type RemotionInputProps = {
  renderBundle: RenderRequest["renderBundle"];
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};

function remotionPort(): number | null {
  if (!process.env.LVSTUDIO_REMOTION_PORT) {
    return null;
  }
  const port = Number(process.env.LVSTUDIO_REMOTION_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid LVSTUDIO_REMOTION_PORT: ${process.env.LVSTUDIO_REMOTION_PORT}`);
  }
  return port;
}

function remotionTimeout(): number {
  const timeout = Number(process.env.LVSTUDIO_REMOTION_TIMEOUT_MS ?? "120000");
  if (!Number.isInteger(timeout) || timeout < 7000) {
    throw new Error(`Invalid LVSTUDIO_REMOTION_TIMEOUT_MS: ${process.env.LVSTUDIO_REMOTION_TIMEOUT_MS}`);
  }
  return timeout;
}

function mimeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  return "application/octet-stream";
}

function sendAssetNotFound(res: ServerResponse): void {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Asset not found.");
}

export function remotionAssetUrl(assetServerUrl: string, assetId: string): string {
  return `${assetServerUrl}/assets/${encodeURIComponent(assetId)}`;
}

async function startAssetServer(
  projectDir: string,
  assets: RenderRequest["renderBundle"]["assetManifest"]["assets"]
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/assets/")) {
      return sendAssetNotFound(res);
    }
    const assetId = decodeURIComponent(url.pathname.slice("/assets/".length));
    const asset = assetsById.get(assetId);
    if (!asset) return sendAssetNotFound(res);

    const absolutePath = path.resolve(projectDir, asset.path);
    if (!absolutePath.startsWith(projectDir + path.sep)) {
      return sendAssetNotFound(res);
    }

    res.writeHead(200, { "content-type": mimeFromPath(absolutePath) });
    createReadStream(absolutePath)
      .on("error", () => sendAssetNotFound(res))
      .pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to start Remotion asset server.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      })
  };
}

export class RemotionRenderer implements RendererProvider {
  id = "remotion";

  capabilities = {
    supportsPreview: false,
    supportsPartialRender: false,
    supportsAlpha: false,
    supportsAudioMixing: true,
    supportedTemplates: ["vertical-story", "documentary-longform"]
  };

  async render(request: RenderRequest): Promise<RenderResult> {
    const assetServer = await startAssetServer(request.projectDir, request.renderBundle.assetManifest.assets);
    try {
      const assetEntries = request.renderBundle.assetManifest.assets.map((asset) => [
        asset.id,
        remotionAssetUrl(assetServer.baseUrl, asset.id)
      ]);
      const assetUrls = Object.fromEntries(assetEntries);

      const inputProps: RemotionInputProps = {
        renderBundle: request.renderBundle,
        quality: request.quality,
        assetUrls
      };

      const serveUrl = await bundle({
        entryPoint: path.resolve(process.cwd(), "apps", "renderer", "src", "index.ts")
      });
      const port = remotionPort();
      const timeoutInMilliseconds = remotionTimeout();
      const composition = await selectComposition({
        serveUrl,
        id: request.renderBundle.resolvedConfig.templateId,
        inputProps,
        port,
        timeoutInMilliseconds
      });

      await renderMedia({
        serveUrl,
        composition,
        codec: "h264",
        outputLocation: request.outputPath,
        inputProps,
        port,
        timeoutInMilliseconds
      });

      return {
        outputPath: request.outputPath,
        durationSeconds: request.renderBundle.timeline.durationSeconds,
        width: request.renderBundle.timeline.width,
        height: request.renderBundle.timeline.height,
        fps: request.renderBundle.timeline.fps,
        providerId: this.id
      };
    } finally {
      await assetServer.close();
    }
  }
}
