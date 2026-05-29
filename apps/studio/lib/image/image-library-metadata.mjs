export function imageDescriptionFromPrompt(prompt) {
  const visualTarget =
    /\nVisual target:\n([\s\S]*?)(?:\n\nShot type:|\n\nStyle preset:|\n\nVisual direction:|$)/.exec(
      String(prompt || ""),
    )?.[1];
  return String(visualTarget || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

export function imageTagsFromPrompt(prompt, { size, quality, model }) {
  const text = String(prompt || "");
  const tags = [
    /Story mode:\s*([^;\n]+)/.exec(text)?.[1],
    /Style preset:\s*([^\n]+)/.exec(text)?.[1],
    /Shot type:\s*([^\n]+)/.exec(text)?.[1],
    /Camera distance:\s*([^\n]+)/.exec(text)?.[1],
    size,
    quality,
    model,
  ]
    .filter(Boolean)
    .map((tag) => String(tag).replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 12);
}
