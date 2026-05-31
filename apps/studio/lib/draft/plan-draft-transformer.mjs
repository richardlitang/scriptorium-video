import { normalizeCaptionTuning } from "./caption-tuning.mjs";
import { normalizeDraftVoiceDirection } from "./draft-voice-direction.mjs";
import { normalizeDraftSfxCues } from "./draft-sfx-cues.mjs";
import { normalizeDraftEditorial } from "./draft-editorial.mjs";
import { mergeDirectionWithLocks } from "./direction-lock-merge.mjs";
import {
  motionIntensityForBeat,
  normalizeDraftVisualFraming,
  normalizeDraftVisualReferences,
} from "./visual-normalization.mjs";

export function createPlanDraftTransformer(deps) {
  const { slugify, estimateDurationSeconds, clampNumber } = deps;

  function buildPlanFromAiDraft(currentPlan, draft) {
    const visualBible = draft.visualBible || {};
    const captionTuning = normalizeCaptionTuning(draft.captionTuning || {});
    const visualBibleSuffix = [
      visualBible.stylePreset ? `Style preset: ${visualBible.stylePreset}` : "",
      visualBible.lookAndFeel ? `Look and feel: ${visualBible.lookAndFeel}` : "",
      Array.isArray(visualBible.characterAnchors) && visualBible.characterAnchors.length > 0
        ? `Character anchors: ${visualBible.characterAnchors.join("; ")}`
        : "",
      Array.isArray(visualBible.characters) && visualBible.characters.length > 0
        ? `Character bible: ${visualBible.characters
            .map((character) =>
              [
                character.name || character.id,
                character.role ? `role=${character.role}` : "",
                character.age ? `age=${character.age}` : "",
                character.body ? `body=${character.body}` : "",
                character.face ? `face=${character.face}` : "",
                character.hair ? `hair=${character.hair}` : "",
                character.wardrobe ? `wardrobe=${character.wardrobe}` : "",
                character.avoid ? `avoid=${character.avoid}` : "",
              ]
                .filter(Boolean)
                .join(", "),
            )
            .join(" | ")}`
        : "",
      Array.isArray(visualBible.locations) && visualBible.locations.length > 0
        ? `Location bible: ${visualBible.locations
            .map((location) =>
              [
                location.name || location.id,
                location.description ? `desc=${location.description}` : "",
                location.continuityNotes ? `continuity=${location.continuityNotes}` : "",
                location.avoid ? `avoid=${location.avoid}` : "",
              ]
                .filter(Boolean)
                .join(", "),
            )
            .join(" | ")}`
        : "",
      Array.isArray(visualBible.objects) && visualBible.objects.length > 0
        ? `Object bible: ${visualBible.objects
            .map((object) =>
              [
                object.name || object.id,
                object.description ? `desc=${object.description}` : "",
                object.continuityNotes ? `continuity=${object.continuityNotes}` : "",
                object.avoid ? `avoid=${object.avoid}` : "",
              ]
                .filter(Boolean)
                .join(", "),
            )
            .join(" | ")}`
        : "",
      Array.isArray(visualBible.continuityRules) && visualBible.continuityRules.length > 0
        ? `Continuity rules: ${visualBible.continuityRules.join("; ")}`
        : "",
      visualBible.negativePrompt ? `Avoid: ${visualBible.negativePrompt}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const nextPlan = {
      ...currentPlan,
      title: draft.title,
      providers: {
        ...currentPlan.providers,
        tts: "chatterbox",
        transcription: "mock",
      },
      voice: {
        ...currentPlan.voice,
        provider: "chatterbox",
        voiceId: "clone",
        format: "wav",
        options: {
          ...currentPlan.voice.options,
          speed: draft.voice?.speed ?? 0.92,
          language: draft.voice?.language || currentPlan.voice?.options?.language,
          emotion:
            draft.voice?.direction ||
            "Narrate as an engaged suspense storyteller: intimate, alert, and controlled, with rising tension, crisp pacing, and quiet dread. Do not sound bored or flat.",
        },
      },
      visualBible: {
        ...(currentPlan.visualBible || {}),
        ...(draft.visualBible || {}),
      },
      direction: {
        creative: {
          feel: String(draft.feel || "").trim() || undefined,
          pacing: String(draft.pacing || "").trim() || undefined,
          visualStyle: String(draft.visualStyle || "").trim() || undefined,
        },
        caption: {
          tuning: captionTuning,
        },
      },
      directionMeta: {
        lockedPaths: currentPlan.directionMeta?.lockedPaths || [],
        sources: {
          ...(currentPlan.directionMeta?.sources || {}),
          creative: "llm",
          caption: "llm",
        },
      },
      overrides: {
        ...(currentPlan.overrides || {}),
        ...(draft.captionTuning
          ? {
              captionTuning: {
                ...(currentPlan.overrides?.captionTuning || {}),
                ...captionTuning,
              },
            }
          : {}),
      },
      sections: draft.sections.map((section, sectionIndex) => {
        const sectionId = slugify(section.title, `section-${sectionIndex + 1}`);
        const previousSection = currentPlan.sections?.[sectionIndex];
        return {
          id: sectionId,
          title: section.title,
          purpose: section.purpose || section.summary || "AI planned story section",
          ...mergeDirectionWithLocks(
            previousSection?.direction,
            previousSection?.directionMeta,
            {
              creative: {
                feel: String(section.feel || "").trim() || undefined,
                pacing: String(section.pacing || "").trim() || undefined,
                visualStyle: String(section.visualStyle || "").trim() || undefined,
              },
            },
            { creative: "llm" },
          ),
          estimatedDurationSeconds: section.beats.reduce(
            (total, beat) =>
              total + (beat.estimatedDurationSeconds || estimateDurationSeconds(beat.narration)),
            0,
          ),
          beats: section.beats.map((beat, beatIndex) => {
            const previousBeat = previousSection?.beats?.[beatIndex];
            const beatNumber = String(beatIndex + 1).padStart(3, "0");
            const beatId = `${sectionId}-${beatNumber}`;
            const shotMetadata = [
              beat.shotType ? `Shot type: ${beat.shotType}` : "",
              beat.cameraDistance ? `Camera distance: ${beat.cameraDistance}` : "",
              beat.lighting ? `Lighting: ${beat.lighting}` : "",
              beat.lens ? `Lens: ${beat.lens}` : "",
              beat.composition ? `Composition: ${beat.composition}` : "",
              beat.subjectContinuity ? `Subject continuity: ${beat.subjectContinuity}` : "",
              beat.negativePromptAdditions
                ? `Avoid (beat-specific): ${beat.negativePromptAdditions}`
                : "",
            ]
              .filter(Boolean)
              .join("\n");
            const visualConfidence = clampNumber(beat.visualConfidence, 0.7, 0, 1);
            const conservativeVisual = visualConfidence < 0.45;
            const visualFraming = normalizeDraftVisualFraming(beat, conservativeVisual);
            const visualReferences = normalizeDraftVisualReferences(beat);
            const motionIntensity = motionIntensityForBeat(
              visualFraming.motionStrength,
              visualFraming.cropRisk,
            );
            const motionType = [
              "none",
              "slow_zoom_in",
              "slow_zoom_out",
              "pan_left",
              "pan_right",
            ].includes(beat.motion)
              ? beat.motion
              : "slow_zoom_in";
            const imageChangeDecision = beat.imageChangeDecision === "hold" ? "hold" : "change";
            let coverageRole = "none";
            if (sectionIndex === 0 && beatIndex === 0) coverageRole = "anchor";
            else if (imageChangeDecision === "change") coverageRole = "key_moment";
            return {
              id: beatId,
              order: beatIndex + 1,
              narration: beat.narration,
              timing: {
                estimatedDurationSeconds:
                  beat.estimatedDurationSeconds || estimateDurationSeconds(beat.narration),
                preferredMinSeconds: 4,
                preferredMaxSeconds: 20,
                mediaPolicy: "loop_or_freeze",
              },
              media: [
                {
                  id: `${beatId}-visual`,
                  type: "title_card",
                  role: "primary_visual",
                  prompt: [
                    beat.visualPrompt || beat.narration,
                    shotMetadata,
                    visualBibleSuffix,
                    conservativeVisual
                      ? "Keep framing simple and continuity-safe. Avoid creative leaps for this beat."
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                  scaleMode: visualFraming.scaleMode,
                  placement: "background",
                },
              ],
              motion: {
                type: conservativeVisual ? "slow_zoom_in" : motionType,
                intensity: motionIntensity,
              },
              visual: {
                prompt: beat.visualPrompt || beat.narration,
                priority: { anchor: 5, key_moment: 4 }[coverageRole] ?? 2,
                needsUniqueImage: imageChangeDecision === "change",
                reusePolicy: imageChangeDecision === "change" ? "none" : "allow-reuse",
                coverageRole,
                scaleMode: visualFraming.scaleMode,
                subjectPosition: visualFraming.subjectPosition,
                cropRisk: visualFraming.cropRisk,
                motionStrength: visualFraming.motionStrength,
                referenceIds: visualReferences.referenceIds,
                referencePriority: visualReferences.referencePriority,
                source: "llm",
              },
              ...mergeDirectionWithLocks(
                previousBeat?.direction,
                previousBeat?.directionMeta,
                {
                  voice: normalizeDraftVoiceDirection(beat),
                  caption: { style: beat.captionStyle || "default", emphasis: beat.emphasis || [] },
                  motion: {
                    type: conservativeVisual ? "slow_zoom_in" : motionType,
                    intensity: motionIntensity,
                  },
                  sfxCues: normalizeDraftSfxCues(beat),
                  editorial: normalizeDraftEditorial(beat),
                },
                {
                  voice: "llm",
                  caption: "llm",
                  motion: "llm",
                  sfx: "llm",
                  editorial: "llm",
                },
              ),
              caption: { emphasis: beat.emphasis || [], style: beat.captionStyle || "default" },
              voiceDirection: normalizeDraftVoiceDirection(beat),
              sfxCues: normalizeDraftSfxCues(beat),
              editorial: normalizeDraftEditorial(beat),
              notes: [beat.notes || beat.visualPrompt || "", shotMetadata, visualBibleSuffix]
                .filter(Boolean)
                .join("\n\n"),
            };
          }),
        };
      }),
    };
    const mergedPlanDirection = mergeDirectionWithLocks(
      currentPlan.direction,
      currentPlan.directionMeta,
      nextPlan.direction,
      nextPlan.directionMeta?.sources || {},
    );
    nextPlan.direction = mergedPlanDirection.direction;
    nextPlan.directionMeta = mergedPlanDirection.directionMeta;
    return nextPlan;
  }

  return { buildPlanFromAiDraft };
}
