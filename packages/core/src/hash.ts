import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function hashFile(filePath: string): Promise<string> {
  return hashString(await readFile(filePath, "utf8"));
}
