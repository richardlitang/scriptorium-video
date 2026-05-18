import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { readFile } from "node:fs/promises";
import path, { extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { RenderRequest, RenderResult, RendererProvider } from "@lvstudio/core";

type RemotionInputProps = {
  renderBundle: RenderRequest["renderBundle"];
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};

function remotionPort(): number {
  const port = Number(process.env.LVSTUDIO_REMOTION_PORT ?? "3101");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid LVSTUDIO_REMOTION_PORT: ${process.env.LVSTUDIO_REMOTION_PORT}`);
  }
  return port;
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

  private mimeFromPath(filePath: string): string | null {
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
    return null;
  }

  private async assetUrl(projectDir: string, relativePath: string): Promise<string> {
    const absolutePath = path.resolve(projectDir, relativePath);
    const mime = this.mimeFromPath(absolutePath);
    if (!mime) {
      return pathToFileURL(absolutePath).href;
    }
    const bytes = await readFile(absolutePath);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }

  async render(request: RenderRequest): Promise<RenderResult> {
    const assetEntries = await Promise.all(
      request.renderBundle.assetManifest.assets.map(async (asset) => [
        asset.id,
        await this.assetUrl(request.projectDir, asset.path)
      ])
    );
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
    const composition = await selectComposition({
      serveUrl,
      id: request.renderBundle.resolvedConfig.templateId,
      inputProps,
      port
    });

    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: request.outputPath,
      inputProps,
      port
    });

    return {
      outputPath: request.outputPath,
      durationSeconds: request.renderBundle.timeline.durationSeconds,
      width: request.renderBundle.timeline.width,
      height: request.renderBundle.timeline.height,
      fps: request.renderBundle.timeline.fps,
      providerId: this.id
    };
  }
}
