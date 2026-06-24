import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeVoiceover } from "@lvstudio/core";

export function createVoicePreviewNormalizer({
  mkdtempImpl = mkdtemp,
  writeFileImpl = writeFile,
  normalizeVoiceoverImpl = normalizeVoiceover,
  readFileImpl = readFile,
  rmImpl = rm,
  tmpdirImpl = os.tmpdir,
  pathImpl = path,
} = {}) {
  return async function normalizePreviewAudio(bytes) {
    const dir = await mkdtempImpl(pathImpl.join(tmpdirImpl(), "lvstudio-voice-preview-"));
    const file = pathImpl.join(dir, "preview.wav");
    try {
      await writeFileImpl(file, bytes);
      await normalizeVoiceoverImpl(file);
      return await readFileImpl(file);
    } finally {
      await rmImpl(dir, { recursive: true, force: true }).catch(() => {});
    }
  };
}
