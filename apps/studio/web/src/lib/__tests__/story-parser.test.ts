import { describe, it, expect } from "vitest";
import {
  splitStorySections,
  extractStoryTitle,
  extractThumbnailConcept,
  buildStoryFeedback,
  buildPlanFromStory,
} from "../story-parser";

const SAMPLE_STORY = `TITLE: The Night Terror
THUMBNAIL CONCEPT: A dark house at midnight with one lit window

[0:00] THE HOOK
It started on a Tuesday. [BACKGROUND VISUAL: empty street at night]
[0:30] THE INCIDENT
Nobody believed her at first.`;

describe("splitStorySections", () => {
  it("parses section headers and bodies", () => {
    const sections = splitStorySections(SAMPLE_STORY);
    expect(sections).toHaveLength(2);
    expect(sections[0].timecode).toBe("0:00");
    expect(sections[0].title).toBe("THE HOOK");
    expect(sections[0].body).toContain("started on a Tuesday");
    expect(sections[1].timecode).toBe("0:30");
  });

  it("returns empty array when no sections", () => {
    expect(splitStorySections("Just some text with no sections")).toHaveLength(0);
  });
});

describe("extractStoryTitle", () => {
  it("extracts TITLE: label", () => {
    expect(extractStoryTitle(SAMPLE_STORY, "Fallback")).toBe("The Night Terror");
  });

  it("falls back when no TITLE label", () => {
    expect(extractStoryTitle("[0:00] HOOK\nNarration.", "My Project")).toBe("My Project");
  });
});

describe("extractThumbnailConcept", () => {
  it("extracts THUMBNAIL CONCEPT", () => {
    const concept = extractThumbnailConcept(SAMPLE_STORY);
    expect(concept).toContain("dark house");
  });

  it("returns undefined when absent", () => {
    expect(extractThumbnailConcept("[0:00] HOOK\nText.")).toBeUndefined();
  });
});

describe("buildStoryFeedback", () => {
  it("warns when TITLE is missing", () => {
    const story = "[0:00] HOOK\nText here. [BACKGROUND VISUAL: something]";
    const plan = { sections: [{ beats: [{}] }] };
    const feedback = buildStoryFeedback(story, plan);
    expect(feedback.some((f) => f.text.includes("TITLE"))).toBe(true);
  });

  it("includes info with beat count", () => {
    const plan = { sections: [{ beats: [{}, {}] }] };
    const feedback = buildStoryFeedback(SAMPLE_STORY, plan);
    const info = feedback.find((f) => f.level === "info");
    expect(info?.text).toContain("2 beat");
  });
});

describe("buildPlanFromStory", () => {
  it("throws when no sections", () => {
    expect(() => buildPlanFromStory("No sections here", {})).toThrow();
  });

  it("sets title from TITLE label", () => {
    const plan = buildPlanFromStory(SAMPLE_STORY, { title: "Old Title" });
    expect((plan as { title: string }).title).toBe("The Night Terror");
  });

  it("produces sections with beats", () => {
    const plan = buildPlanFromStory(SAMPLE_STORY, {}) as {
      sections: { id: string; beats: { narration: string }[] }[];
    };
    expect(plan.sections).toHaveLength(2);
    expect(plan.sections[0].beats.length).toBeGreaterThan(0);
  });

  it("embeds THUMBNAIL CONCEPT in first section notes", () => {
    const plan = buildPlanFromStory(SAMPLE_STORY, {}) as {
      sections: { beats: { notes: string }[] }[];
    };
    expect(plan.sections[0].beats[0].notes).toContain("THUMBNAIL CONCEPT");
  });
});
