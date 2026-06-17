import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createStudioServerRuntime } from "./lib/runtime/studio-server-runtime-factory.mjs";
import { spaAssetForPath } from "./static-assets.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const webDistDir = path.join(__dirname, "web/dist");
const legacyPublicDir = path.join(__dirname, "public");
const useSpaDist = fs.existsSync(path.join(webDistDir, "index.html"));
const publicDir = useSpaDist ? webDistDir : legacyPublicDir;
const publicAssetForPathOverride = useSpaDist ? spaAssetForPath : undefined;

if (useSpaDist) {
  console.log("Serving React SPA from web/dist");
}

const runtime = createStudioServerRuntime({
  rootDir,
  publicDir,
  ...(publicAssetForPathOverride ? { publicAssetForPath: publicAssetForPathOverride } : {}),
});
const { port, handleStudioHttpRequest } = runtime;
const server = createServer(handleStudioHttpRequest);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    try {
      if (typeof runtime.dispose === "function") runtime.dispose();
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

server.listen(port, () => {
  console.log(`Studio running at http://localhost:${port}`);
  // Start warming the Chatterbox TTS model in the background so the UI shows
  // "warming -> ready" on its own instead of "unreachable" until the user
  // triggers a draft action. No-op when autostart is disabled.
  if (typeof runtime.warmChatterbox === "function") runtime.warmChatterbox("boot");
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
