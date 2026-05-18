import { createHash } from "node:crypto";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function imageReuseKey({ narration, size, quality, model }) {
  return sha256(JSON.stringify({
    narration: normalizeText(narration),
    size,
    quality,
    model
  }));
}

export function narrationFromImagePrompt(prompt) {
  return /^Current beat narration:\s*(.+)$/m.exec(String(prompt || ""))?.[1];
}

function newestFirst(a, b) {
  return String(b.generatedAt || "").localeCompare(String(a.generatedAt || ""));
}

export function selectCachedImage(entries, { inputHash, reuseKey, size, quality, model, allowNarrationReuse }) {
  const candidates = entries
    .filter((entry) =>
      entry &&
      entry.rootPath &&
      entry.size === size &&
      entry.quality === quality &&
      entry.model === model
    )
    .sort(newestFirst);

  return candidates.find((entry) => entry.inputHash === inputHash) ??
    (allowNarrationReuse ? candidates.find((entry) => entry.reuseKey === reuseKey) : undefined);
}
