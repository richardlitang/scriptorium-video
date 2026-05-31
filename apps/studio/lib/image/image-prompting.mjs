import {
  normalizeReferenceIds,
  normalizeReferencePriority,
} from "../draft/visual-normalization.mjs";
import { imageVisualDirection } from "./image-visual-direction.mjs";

function narrationSummary(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionBeatContext(section, sectionIndex, beat, beatIndex, plan) {
  const beats = section.beats ?? [];
  const previousBeat = beats[beatIndex - 1];
  const nextBeat = beats[beatIndex + 1];
  return [
    `Project title: ${plan.title}.`,
    `Story mode: ${plan.mode}; target platform: ${plan.targetPlatform}.`,
    `Section ${sectionIndex + 1} of ${plan.sections?.length ?? "unknown"}: ${section.title}.`,
    section.purpose ? `Section purpose: ${section.purpose}.` : "",
    `Beat ${beatIndex + 1} of ${beats.length} in this section.`,
    previousBeat
      ? `Previous beat narration: ${narrationSummary(previousBeat.narration)}`
      : "Previous beat narration: none; this opens the section.",
    `Current beat narration: ${narrationSummary(beat.narration)}`,
    nextBeat
      ? `Next beat narration: ${narrationSummary(nextBeat.narration)}`
      : "Next beat narration: none; this closes the section.",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeAnchorTerms(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreAnchor(entry, beatText) {
  const haystack = normalizeAnchorTerms(beatText);
  const parts = [
    entry.name,
    entry.id,
    entry.role,
    entry.description,
    entry.body,
    entry.face,
    entry.hair,
    entry.wardrobe,
  ]
    .map((part) => normalizeAnchorTerms(part))
    .filter(Boolean);
  if (parts.length === 0 || !haystack) return 0;
  let score = 0;
  for (const part of parts) {
    if (part.length < 3) continue;
    if (haystack.includes(part)) score += 2;
    const tokens = part.split(" ").filter((token) => token.length >= 4);
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1;
    }
  }
  return score;
}

function selectRelevantAnchors(entries, beatText, limit) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length <= limit) return list;
  const ranked = list
    .map((entry, index) => ({ entry, index, score: scoreAnchor(entry, beatText) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.entry);
  if (selected.length > 0) return selected;
  return list.slice(0, limit);
}

function visualBibleAnchorIndex(visualBible = {}) {
  const map = new Map();
  const addAll = (entries = [], kind) => {
    for (const entry of entries) {
      const id = String(entry?.id || "").trim();
      if (!id) continue;
      map.set(id, { ...entry, kind });
    }
  };
  addAll(visualBible.characters, "character");
  addAll(visualBible.locations, "location");
  addAll(visualBible.objects, "object");
  return map;
}

export function imagePromptForBeat(plan, section, beat, beatIndex) {
  const mediaPrompt = beat.media?.find(
    (media) => media.role === "primary_visual" || media.role === "background",
  )?.prompt;
  const beatText = [
    beat.narration,
    beat.notes,
    beat.media?.find((media) => media.role === "primary_visual" || media.role === "background")
      ?.prompt,
    beat.visual?.prompt,
  ]
    .filter(Boolean)
    .join(" ");
  const visualBible = plan.visualBible || {};
  const selectedCharacters = selectRelevantAnchors(visualBible.characters, beatText, 3);
  const selectedLocations = selectRelevantAnchors(visualBible.locations, beatText, 2);
  const selectedObjects = selectRelevantAnchors(visualBible.objects, beatText, 3);
  const anchorById = visualBibleAnchorIndex(visualBible);
  const referenceIds = normalizeReferenceIds(beat.visual?.referenceIds);
  const referencePriority = normalizeReferencePriority(beat.visual?.referencePriority, "medium");
  const referencedAnchors = referenceIds
    .map((id) => anchorById.get(id))
    .filter((entry) => Boolean(entry))
    .slice(0, 6);
  const visualDirection = imageVisualDirection(
    {
      ...plan,
      visualBible: {
        ...visualBible,
        characters: selectedCharacters,
        locations: selectedLocations,
        objects: selectedObjects,
      },
    },
    section,
  );
  const isShorts = plan?.mode === "short_story";
  const frameInstruction = isShorts
    ? "Create a vertical 9:16 image for the current beat."
    : "Create a landscape 16:9 image for the current beat.";
  const frameCoherenceInstruction = isShorts
    ? "Keep anatomy, geometry, lighting, and composition coherent for a vertical frame."
    : "Keep anatomy, geometry, lighting, and composition coherent for a landscape frame.";
  const frameSafetyInstruction = isShorts
    ? "Keep primary faces, hands, and story-critical objects inside the central safe area with clear edge breathing room; avoid edge-cropped framing."
    : "Keep primary faces, hands, and story-critical objects fully visible with edge breathing room; avoid edge-cropped framing.";
  return [
    sectionBeatContext(section, plan.sections.indexOf(section), beat, beatIndex, plan),
    "",
    "Visual target:",
    mediaPrompt || beat.notes || beat.narration,
    "",
    visualDirection ? "Visual direction:" : "",
    visualDirection,
    referencedAnchors.length > 0
      ? `Reference anchors (${referencePriority}): ${referencedAnchors
          .map((entry) =>
            [
              entry.kind,
              entry.name || entry.id,
              entry.description || entry.face || entry.body || entry.continuityNotes || "",
            ]
              .filter(Boolean)
              .join(": "),
          )
          .join(" | ")}`
      : "",
    "",
    frameInstruction,
    "Follow the visual direction exactly; do not add a visual medium, rendering style, camera format, or realism level that conflicts with it.",
    "Depict the exact current beat, not a generic mood board and not a later event.",
    "Preserve continuity with the immediately previous and next beats, but do not introduce objects, characters, or reveals that have not happened yet.",
    frameCoherenceInstruction,
    frameSafetyInstruction,
    "Avoid fake text, UI, subtitles, watermarks, logos, split screens, soundwave graphics, continuity errors, distorted hands or faces, and unintended extra objects or characters.",
  ].join("\n");
}

export function defaultImageSizeForPlan(plan) {
  return plan?.mode === "short_story" ? "1024x1536" : "1536x1024";
}

export function imageTargetsFromPlan(plan) {
  const anchorById = visualBibleAnchorIndex(plan.visualBible || {});
  return plan.sections.flatMap((section) =>
    section.beats.map((beat, beatIndex) => ({
      section,
      beat,
      beatIndex,
      assetId: `image-${beat.id}`,
      defaultPrompt: imagePromptForBeat(plan, section, beat, beatIndex),
      referenceIds: normalizeReferenceIds(beat.visual?.referenceIds),
      referencePriority: normalizeReferencePriority(beat.visual?.referencePriority, "medium"),
      references: normalizeReferenceIds(beat.visual?.referenceIds)
        .map((id) => anchorById.get(id))
        .filter((entry) => Boolean(entry)),
    })),
  );
}
