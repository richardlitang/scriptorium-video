import { readFile } from "node:fs/promises";
import path from "node:path";

export function parseEnvFile(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line
          .slice(index + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

export async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  return parseEnvFile(raw);
}

export async function resolveOpenAiApiKey({
  env = process.env,
  rootDir = process.cwd(),
}: {
  env?: NodeJS.ProcessEnv;
  rootDir?: string;
} = {}): Promise<string> {
  if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY;

  const envPaths = [
    env.LVSTUDIO_OPENAI_ENV_FILE,
    path.resolve(rootDir, ".env.local"),
    path.resolve(rootDir, "..", "support", ".env.local"),
  ].filter((entry): entry is string => Boolean(entry));

  for (const envPath of envPaths) {
    const values = await readEnvFile(envPath);
    if (values.OPENAI_API_KEY) return values.OPENAI_API_KEY;
  }

  throw new Error(
    "Missing OPENAI_API_KEY. Set it in env, LVSTUDIO_OPENAI_ENV_FILE, or ../support/.env.local.",
  );
}
