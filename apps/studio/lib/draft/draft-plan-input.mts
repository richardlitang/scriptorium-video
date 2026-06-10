type PlannerDirectiveKind = "visual" | "sfx" | "silence";

type PlannerDirective = {
  lineIndex: number;
  text: string;
  kind: PlannerDirectiveKind;
};

type PlannerStoryParseResult = {
  narrationUnits: string[];
  directives: PlannerDirective[];
};

type PlannerSection = {
  id?: string;
  beats?: unknown[];
};

type StoryInputPlan = {
  schemaVersion: 1;
  sections: PlannerSection[];
  [key: string]: unknown;
};

type SplitPlannerConfig = {
  enabled?: boolean;
  minWords?: number;
  minUnits?: number;
};

type PlannerRequestBody = {
  plannerMode?: string;
};

type DraftPlan = Record<string, unknown> & {
  sections?: Array<{ beats?: Array<{ narration?: string }> }>;
  providers?: Record<string, unknown>;
  voice?: Record<string, unknown> & {
    voiceId?: string;
    options?: Record<string, unknown>;
  };
};

function classifyDirectiveKind(text: string): PlannerDirectiveKind {
  if (/^(?:background visual|visual)\s*:/i.test(text)) return "visual";
  if (/sfx|sound|low thud|music/i.test(text)) return "sfx";
  if (/pause|silence/i.test(text)) return "silence";
  return "visual";
}

export function parsePlanFromStoryInput(rawInput: string): StoryInputPlan | undefined {
  try {
    const parsed = JSON.parse(rawInput);
    if (parsed?.schemaVersion === 1 && Array.isArray(parsed.sections)) return parsed;
  } catch {
    // Plain story prose is the common path.
  }
  return undefined;
}

export function countStoryWords(value: string): number {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeWhitespace(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripNonSpokenDirectives(text: string): string {
  return normalizeWhitespace(
    String(text || "")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\b(?:SMASH CUT TO BLACK|CUT TO BLACK|LOW THUD)\b\.?/gi, " "),
  );
}

export function isNonSpokenDirective(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return true;
  if (/^\[[^\]]+\]$/.test(normalized)) return true;
  if (
    /^\[[^\]]+\]/.test(normalized) &&
    /background visual|visual:|sfx:|cut to black|smash cut|low thud|slow pan|slow zoom|music:|sound:/i.test(
      normalized,
    )
  )
    return true;
  if (
    /^(?:background visual|visual|sfx|music|sound|cut to black|smash cut|low thud|slow pan|slow zoom)\s*:/i.test(
      normalized,
    )
  )
    return true;
  if (/^(?:cut to black|smash cut to black|low thud)\.?$/i.test(normalized)) return true;
  if (/^(?:\d+\s*[-:]\s*)?(?:\d+\s*(?:minute|min)\b).*script$/i.test(normalized)) return true;
  return false;
}

export function parseStoryForPlanner(rawStory: string): PlannerStoryParseResult {
  const story = String(rawStory || "").trim();
  if (!story) return { narrationUnits: [], directives: [] };

  const directives: PlannerDirective[] = [];
  const sourceLines = story
    .split(/\n+/)
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) => line.trim());

  const lineNarration = sourceLines
    .map(({ line, lineIndex }) => {
      for (const match of line.matchAll(/\[([^\]]+)\]/g)) {
        const text = normalizeWhitespace(match[1]);
        if (text) {
          const kind = classifyDirectiveKind(text);
          directives.push({
            lineIndex,
            text,
            kind,
          });
        }
      }
      const narration = stripNonSpokenDirectives(line);
      return isNonSpokenDirective(narration) ? "" : narration;
    })
    .filter(Boolean);

  const narrationUnits =
    lineNarration.length > 0
      ? lineNarration
      : story
          .split(/\n\s*\n+/)
          .map(stripNonSpokenDirectives)
          .filter((unit) => unit && !isNonSpokenDirective(unit));

  return { narrationUnits, directives };
}

export function splitStoryIntoLockedUnits(rawStory: string): string[] {
  const parsed = parseStoryForPlanner(rawStory);
  if (parsed.narrationUnits.length > 0) return parsed.narrationUnits;
  const story = normalizeWhitespace(rawStory);
  return story ? [story] : [];
}

export function buildPlannerStoryInput(rawStory: string): string {
  const parsed = parseStoryForPlanner(rawStory);
  const narration = parsed.narrationUnits.join("\n");
  if (!parsed.directives.length) return narration;
  const directives = parsed.directives
    .map((directive) => `- line ${directive.lineIndex + 1} ${directive.kind}: ${directive.text}`)
    .join("\n");
  return [
    "SPOKEN NARRATION - only this text may appear in beat narration or TTS:",
    narration,
    "",
    "PRODUCTION DIRECTIVES - use only as visual, sound, edit, or silence metadata; never narrate these words:",
    directives,
  ]
    .join("\n")
    .trim();
}

function integerSetting(
  value: string | number | undefined | null,
  fallback: number,
  { min = 1 }: { min?: number } = {},
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return parsed;
}

export function resolveSplitPlannerConfig(
  env: Record<string, string | undefined> = process.env,
): Required<SplitPlannerConfig> {
  return {
    enabled: env.LVSTUDIO_SPLIT_PLANNER !== "0",
    minWords: integerSetting(env.LVSTUDIO_SPLIT_PLANNER_MIN_WORDS, 2500),
    minUnits: integerSetting(env.LVSTUDIO_SPLIT_PLANNER_MIN_UNITS, 40),
  };
}

export function plannerSplitDecision(
  body: PlannerRequestBody = {},
  story = "",
  splitPlannerConfig: SplitPlannerConfig = resolveSplitPlannerConfig(),
): {
  enabled: boolean;
  reason: string;
  wordCount?: number;
  unitCount?: number;
  minWords?: number;
  minUnits?: number;
} {
  if (body.plannerMode === "single") return { enabled: false, reason: "explicit-single" };
  if (body.plannerMode === "split") return { enabled: true, reason: "explicit-split" };
  const splitPlannerEnabled = splitPlannerConfig.enabled !== false;
  if (!splitPlannerEnabled) return { enabled: false, reason: "env-disabled" };

  const units = splitStoryIntoLockedUnits(story);
  const wordCount = countStoryWords(units.join(" "));
  const minWords = integerSetting(splitPlannerConfig.minWords, 2500);
  const minUnits = integerSetting(splitPlannerConfig.minUnits, 40);
  const enabled = wordCount >= minWords || units.length >= minUnits;
  return {
    enabled,
    reason: enabled ? "threshold" : "below-threshold",
    wordCount,
    unitCount: units.length,
    minWords,
    minUnits,
  };
}

export function isScaffoldPlaceholderPlan(plan: DraftPlan | null | undefined): boolean {
  const beats = (plan?.sections ?? []).flatMap((section) => section.beats ?? []);
  return beats.some(
    (beat) =>
      String(beat?.narration ?? "")
        .trim()
        .toLowerCase() === "replace this narration with your first beat.",
  );
}

export function applyDraftDefaults(plan: DraftPlan): DraftPlan {
  return {
    ...plan,
    providers: {
      ...plan.providers,
      tts: "chatterbox",
      transcription: "mock",
    },
    voice: {
      ...plan.voice,
      provider: "chatterbox",
      voiceId: ["onyx", "manual-voice", "verse", "marin"].includes(String(plan.voice?.voiceId))
        ? "clone"
        : plan.voice?.voiceId || "clone",
      format: "wav",
      options: {
        ...plan.voice?.options,
        speed: 0.92,
        emotion:
          "Narrate as an engaged video storyteller: intimate, alert, and controlled. Match the genre and beat direction, slow slightly on important turns, and avoid sounding flat or theatrical.",
      },
    },
  };
}
