// Pure story-parsing logic — ported from apps/studio/public/app.js

export type StorySection = { timecode: string; title: string; body: string };
export type FeedbackItem = { level: "info" | "warning" | "step" | "error"; text: string };

function storyLines(rawScript: string) {
  return String(rawScript ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n");
}

function compactWhitespace(value: string) {
  return String(value ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function stripWrappingQuotes(value: string) {
  let output = String(value ?? "").trim();
  const quoteChars = new Set(['"', "'", "“", "”"]);
  while (output && quoteChars.has(output[0])) output = output.slice(1).trimStart();
  while (output && quoteChars.has(output[output.length - 1]))
    output = output.slice(0, -1).trimEnd();
  return output;
}

function labelValueLine(line: string, label: string) {
  const trimmed = String(line ?? "").trim();
  const prefix = `${label}:`;
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return "";
  return trimmed.slice(prefix.length).trim();
}

function firstLabelValue(rawScript: string, label: string) {
  for (const line of storyLines(rawScript)) {
    const value = labelValueLine(line, label);
    if (value) return value;
  }
  return "";
}

function parseStorySectionHeader(line: string) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed.startsWith("[")) return null;
  const closeIndex = trimmed.indexOf("]");
  if (closeIndex <= 1) return null;
  const timecode = trimmed.slice(1, closeIndex).trim();
  const [minutes, seconds, extra] = timecode.split(":");
  if (extra !== undefined || !minutes || !seconds) return null;
  if (![minutes, seconds].every((part) => [...part].every((c) => c >= "0" && c <= "9")))
    return null;
  const title = trimmed.slice(closeIndex + 1).trim();
  if (!title) return null;
  return { timecode, title };
}

function removeBracketDirectives(value: string, replacement = " ") {
  const source = String(value ?? "");
  let output = "";
  let depth = 0;
  for (const char of source) {
    if (char === "[") {
      if (depth === 0) output += replacement;
      depth += 1;
      continue;
    }
    if (char === "]" && depth > 0) {
      depth -= 1;
      continue;
    }
    if (depth === 0) output += char;
  }
  return output;
}

function removeParentheticalDirective(value: string, labels: string[]) {
  const source = String(value ?? "");
  let output = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "(") {
      output += source[index];
      index += 1;
      continue;
    }
    const closeIndex = source.indexOf(")", index + 1);
    if (closeIndex === -1) {
      output += source[index];
      index += 1;
      continue;
    }
    const inner = source.slice(index + 1, closeIndex).trim().toLowerCase();
    if (labels.some((label) => inner.startsWith(label))) {
      output += " ";
      index = closeIndex + 1;
      continue;
    }
    output += source.slice(index, closeIndex + 1);
    index = closeIndex + 1;
  }
  return output;
}

function extractDirectives(sectionBody: string) {
  const directives: string[] = [];
  let index = 0;
  const source = String(sectionBody ?? "");
  while (index < source.length) {
    const openIndex = source.indexOf("[", index);
    if (openIndex === -1) break;
    const closeIndex = source.indexOf("]", openIndex + 1);
    if (closeIndex === -1) break;
    const content = source.slice(openIndex + 1, closeIndex);
    const separatorIndex = content.indexOf(":");
    if (separatorIndex > 0) {
      const label = content.slice(0, separatorIndex).trim();
      const value = content.slice(separatorIndex + 1).trim();
      const labelLooksDirective =
        label &&
        [...label].every(
          (c) => (c >= "A" && c <= "Z") || c === " " || c === "/" || c === "-",
        );
      if (labelLooksDirective && value)
        directives.push(`${label}: ${compactWhitespace(value)}`);
    }
    index = closeIndex + 1;
  }
  return directives.join("\n");
}

function normalizeNarration(sectionBody: string) {
  return compactWhitespace(
    removeParentheticalDirective(
      removeBracketDirectives(sectionBody),
      ["pause", "long pause", "deliver"],
    ),
  );
}

function splitNarrationParagraphs(sectionBody: string) {
  return removeBracketDirectives(sectionBody, "\n\n")
    .split("\n\n")
    .map((p) =>
      compactWhitespace(
        removeParentheticalDirective(p, ["pause", "long pause", "deliver"]),
      ),
    )
    .filter(Boolean);
}

function estimateDurationSeconds(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Number((words * 0.42).toFixed(1))));
}

function slugify(value: string, fallback: string) {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function splitStorySections(rawScript: string): StorySection[] {
  const sections: Array<{
    timecode: string;
    title: string;
    bodyLines: string[];
  }> = [];
  for (const line of storyLines(rawScript)) {
    const header = parseStorySectionHeader(line);
    if (header) {
      sections.push({ ...header, bodyLines: [] });
      continue;
    }
    if (sections.length > 0) sections[sections.length - 1].bodyLines.push(line);
  }
  return sections.map((s) => ({
    timecode: s.timecode,
    title: s.title,
    body: s.bodyLines.join("\n").trim(),
  }));
}

export function extractStoryTitle(rawScript: string, fallbackTitle: string) {
  return firstLabelValue(rawScript, "TITLE") || fallbackTitle;
}

export function projectTitleFromStory(rawStory: string) {
  const explicitTitle = firstLabelValue(rawStory, "TITLE");
  if (explicitTitle) return explicitTitle;
  const firstLine = storyLines(rawStory)
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return "Untitled Story";
  return stripWrappingQuotes(firstLine).slice(0, 80) || "Untitled Story";
}

export function extractThumbnailConcept(rawScript: string) {
  const lines = storyLines(rawScript);
  const startIndex = lines.findIndex((line) => labelValueLine(line, "THUMBNAIL CONCEPT"));
  if (startIndex === -1) return undefined;
  const firstLine = labelValueLine(lines[startIndex], "THUMBNAIL CONCEPT");
  const body = [firstLine];
  for (const line of lines.slice(startIndex + 1)) {
    if (parseStorySectionHeader(line)) break;
    if (labelValueLine(line, "TITLE")) break;
    body.push(line.trim());
  }
  return compactWhitespace(body.join(" "));
}

export function buildStoryFeedback(rawScript: string, plan: { sections: { beats: unknown[] }[] }): FeedbackItem[] {
  const sections = splitStorySections(rawScript);
  const items: FeedbackItem[] = [];
  if (!firstLabelValue(rawScript, "TITLE")) {
    items.push({
      level: "warning",
      text: "Missing TITLE line; existing project title will be reused.",
    });
  }
  if (!extractThumbnailConcept(rawScript)) {
    items.push({
      level: "warning",
      text: "Missing THUMBNAIL CONCEPT; add one if this should drive cover art later.",
    });
  }
  const visualLabels = ["BACKGROUND VISUAL", "IMAGE", "VISUAL", "MEDIA", "B-ROLL", "BROLL"];
  for (const section of sections) {
    const hasVisual = extractDirectives(section.body)
      .split("\n")
      .some((d) => visualLabels.some((label) => d.toUpperCase().startsWith(`${label}:`)));
    if (!hasVisual) {
      items.push({
        level: "warning",
        text: `[${section.timecode}] ${section.title}: missing visual/image directive; Studio will use title-card placeholders.`,
      });
    }
  }
  const beatCount = plan.sections.reduce((total, s) => total + s.beats.length, 0);
  items.push({
    level: "info",
    text: `Converted ${sections.length} section(s) into ${beatCount} beat(s).`,
  });
  items.push({
    level: "step",
    text: "Next: Save Plan, optionally Generate Images, then Regenerate Audio, then Render Draft.",
  });
  return items;
}

export function buildPlanFromStory(rawScript: string, currentPlan: Record<string, unknown>): Record<string, unknown> {
  const title = extractStoryTitle(rawScript, String((currentPlan["title"] as string | undefined) ?? ""));
  const thumbnailConcept = extractThumbnailConcept(rawScript);
  const sections = splitStorySections(rawScript);
  if (sections.length === 0) {
    throw new Error("Story script needs timestamped sections like [0:00] THE HOOK.");
  }

  return {
    ...currentPlan,
    title,
    providers: {
      ...(currentPlan["providers"] as object | undefined),
      tts: "chatterbox",
      transcription: "mock",
    },
    voice: {
      ...(currentPlan["voice"] as object | undefined),
      provider: "chatterbox",
      voiceId: "clone",
      format: "wav",
      options: {
        ...((currentPlan["voice"] as Record<string, unknown> | undefined)?.["options"] as object | undefined),
        speed: 0.95,
        emotion:
          "Narrate like a tense supernatural horror story: restrained, intimate, serious, and cinematic. Avoid theatrical overacting.",
      },
    },
    sections: sections.map((section, index) => {
      const sectionId = slugify(section.title, `section-${index + 1}`);
      const paragraphs = splitNarrationParagraphs(section.body);
      const notes = [
        thumbnailConcept && index === 0 ? `THUMBNAIL CONCEPT: ${thumbnailConcept}` : "",
        extractDirectives(section.body),
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        id: sectionId,
        title: section.title,
        purpose: section.timecode,
        estimatedDurationSeconds: paragraphs.reduce(
          (total, p) => total + estimateDurationSeconds(p),
          0,
        ),
        beats: (paragraphs.length > 0
          ? paragraphs
          : [normalizeNarration(section.body) || section.title]
        ).map((paragraph, beatIndex) => {
          const beatNumber = String(beatIndex + 1).padStart(3, "0");
          return {
            id: `${sectionId}-${beatNumber}`,
            order: beatIndex + 1,
            narration: paragraph,
            timing: {
              estimatedDurationSeconds: estimateDurationSeconds(paragraph),
              preferredMinSeconds: 4,
              preferredMaxSeconds: 20,
              mediaPolicy: "loop_or_freeze",
            },
            media: [
              {
                id: `${sectionId}-${beatNumber}-visual`,
                type: "title_card",
                role: "primary_visual",
                prompt: notes || paragraph,
                scaleMode: "safe_cover",
                placement: "background",
              },
            ],
            motion: { type: "slow_zoom_in", intensity: 0.12 },
            caption: { emphasis: [], style: "default" },
            notes,
          };
        }),
      };
    }),
  };
}
