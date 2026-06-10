type CurrentPlan = {
  title?: string;
  mode?: string;
  targetPlatform?: string;
  stylePackId?: string;
  providers?: {
    llm?: string;
    tts?: string;
    transcription?: string;
    media?: string;
    renderer?: string;
  };
  voice?: {
    provider?: string;
    voiceId?: string;
    format?: string;
    options?: {
      language?: string;
    };
  };
  direction?: {
    creative?: {
      feel?: string;
      pacing?: string;
      visualStyle?: string;
    };
  };
};

type CreativeDirection = {
  feel?: string;
  pacing?: string;
  visualStyle?: string;
};

type SplitPlanBuilderDeps = {
  splitStoryIntoLockedUnits: (story: string) => string[];
  splitPlannerBeatsPerSection: number;
  splitPlannerMaxSections: number;
  slugify: (value: string, fallback: string) => string;
  estimateDurationSeconds: (narration: string) => number;
};

function chunkLockedUnits(units: string[], chunkSize = 8): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < units.length; index += chunkSize) {
    chunks.push(units.slice(index, index + chunkSize));
  }
  return chunks;
}

function lockedSectionTitle(index: number, total: number): string {
  if (total <= 1) return "Story";
  return `Story Part ${index + 1}`;
}

export function createSplitPlanBuilder(deps: SplitPlanBuilderDeps) {
  const {
    splitStoryIntoLockedUnits,
    splitPlannerBeatsPerSection,
    splitPlannerMaxSections,
    slugify,
    estimateDurationSeconds,
  } = deps;

  function buildLockedPlanFromStory(
    currentPlan: CurrentPlan,
    story: string,
    direction: CreativeDirection = {},
  ) {
    const units = splitStoryIntoLockedUnits(story);
    const chunkSize = Math.max(
      splitPlannerBeatsPerSection,
      Math.ceil(units.length / splitPlannerMaxSections),
    );
    const chunks = chunkLockedUnits(units, chunkSize);
    const sections = chunks.map((chunk, sectionIndex) => {
      const title = lockedSectionTitle(sectionIndex, chunks.length);
      const sectionId = slugify(title, `section-${sectionIndex + 1}`);
      return {
        id: sectionId,
        title,
        purpose: "Locked source script segment",
        direction: {
          creative: {
            feel: direction.feel || undefined,
            pacing: direction.pacing || undefined,
            visualStyle: direction.visualStyle || undefined,
          },
        },
        estimatedDurationSeconds: chunk.reduce(
          (total, narration) => total + estimateDurationSeconds(narration),
          0,
        ),
        beats: chunk.map((narration, beatIndex) => {
          const beatId = `${sectionId}-${String(beatIndex + 1).padStart(3, "0")}`;
          return {
            id: beatId,
            order: beatIndex + 1,
            narration,
            timing: {
              estimatedDurationSeconds: estimateDurationSeconds(narration),
              preferredMinSeconds: 3,
              preferredMaxSeconds: 12,
              locked: true,
              mediaPolicy: "loop_or_freeze",
            },
            media: [
              {
                id: `${beatId}-visual`,
                type: "title_card",
                role: "primary_visual",
                prompt: narration,
                scaleMode: "safe_cover",
                placement: "background",
              },
            ],
            motion: { type: "slow_zoom_in", intensity: 0.12 },
            visual: {
              prompt: narration,
              priority: sectionIndex === 0 && beatIndex === 0 ? 5 : 3,
              needsUniqueImage: true,
              reusePolicy: "none",
              coverageRole: sectionIndex === 0 && beatIndex === 0 ? "anchor" : "key_moment",
              scaleMode: "safe_cover",
              subjectPosition: "center",
              cropRisk: "medium",
              motionStrength: "medium",
              referenceIds: [],
              referencePriority: "medium",
              source: "default",
            },
            caption: { emphasis: [], style: "default" },
            voiceDirection: {
              profile: "neutral",
              emphasis: [],
              pauseBeforeMs: 0,
              pauseAfterMs: 80,
              intensity: 0.5,
              speedMultiplier: 1,
              pitchOffset: 0,
              language: currentPlan.voice?.options?.language,
              ttsProvider: currentPlan.providers?.tts,
              source: "default",
            },
            sfxCues: [],
            editorial: { visualEditCues: [], silenceWindows: [] },
            notes: narration,
          };
        }),
      };
    });

    return {
      ...currentPlan,
      title: currentPlan.title || "Untitled Story",
      mode: currentPlan.mode || "short_story",
      targetPlatform: currentPlan.targetPlatform || "local_only",
      stylePackId: currentPlan.stylePackId || "default",
      providers: {
        llm: currentPlan.providers?.llm || "openai",
        tts: currentPlan.providers?.tts || "chatterbox",
        transcription: currentPlan.providers?.transcription || "mock",
        media: currentPlan.providers?.media || "manual-media",
        renderer: currentPlan.providers?.renderer || "remotion",
      },
      voice: currentPlan.voice || {
        provider: "chatterbox",
        voiceId: "clone",
        format: "wav",
        options: {},
      },
      direction: {
        ...(currentPlan.direction || {}),
        creative: {
          ...(currentPlan.direction?.creative || {}),
          feel: direction.feel || currentPlan.direction?.creative?.feel,
          pacing: direction.pacing || currentPlan.direction?.creative?.pacing,
          visualStyle: direction.visualStyle || currentPlan.direction?.creative?.visualStyle,
        },
      },
      sections,
    };
  }

  return { buildLockedPlanFromStory };
}
