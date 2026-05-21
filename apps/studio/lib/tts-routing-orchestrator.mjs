import { runStructuredOutput } from "./openai-structured-output.mjs";

const TTS_ROUTING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["routes", "warnings"],
  properties: {
    routes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beatId", "narrationLanguage", "ttsProvider", "confidence", "reason"],
        properties: {
          beatId: { type: "string" },
          narrationLanguage: { type: "string" },
          ttsProvider: { type: "string", enum: ["chatterbox", "mms", "openai"] },
          confidence: { type: "number" },
          reason: { type: "string" }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
};

export function planNeedsTtsRouting(plan) {
  return (plan.sections ?? []).some((section) =>
    (section.beats ?? []).some((beat) =>
      !beat.voiceDirection?.language ||
      !beat.voiceDirection?.ttsProvider ||
      beat.voiceDirection?.source === "llm" ||
      beat.directionMeta?.sources?.ttsRouting === "llm"
    )
  );
}

export function createTtsRoutingOrchestrator({ fetchImpl = fetch, getOpenAiApiKey, studioTestMode = false, openAiResponsesUrl }) {
  if (typeof getOpenAiApiKey !== "function") throw new Error("createTtsRoutingOrchestrator requires getOpenAiApiKey function.");

  return async function routePlanTtsWithOpenAi(plan) {
    if (studioTestMode) return { plan, model: "test-mode", warnings: [] };

    const apiKey = await getOpenAiApiKey();
    const model = process.env.OPENAI_TTS_ROUTING_MODEL ?? process.env.OPENAI_ORCHESTRATOR_MODEL ?? "gpt-4o-mini";
    const beats = (plan.sections ?? []).flatMap((section) =>
      (section.beats ?? []).map((beat) => ({
        beatId: beat.id,
        sectionTitle: section.title,
        narration: beat.narration,
        currentLanguage: beat.voiceDirection?.language || beat.direction?.voice?.language || plan.voice?.options?.language,
        currentTtsProvider: beat.voiceDirection?.ttsProvider || beat.direction?.voice?.ttsProvider || plan.providers?.tts
      }))
    );

    const routing = await runStructuredOutput({
      fetchImpl,
      url: openAiResponsesUrl,
      apiKey,
      model,
      input: [
        {
          role: "system",
          content: [
            "You are a video production TTS routing orchestrator.",
            "Map each beat to the best local TTS provider and narration language.",
            "Use chatterbox for mostly English narration, including English beats with short Filipino/Tagalog quotes.",
            "Use mms only when the beat narration itself is mostly Filipino/Tagalog.",
            "Use openai only when neither local provider is appropriate.",
            "Do not infer from character names alone; route based on the actual spoken narration text.",
            "English narration with Filipino names, places, or words like Lola is still English unless the spoken sentence itself is mostly Filipino/Tagalog.",
            "Return JSON only."
          ].join("\\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            title: plan.title,
            defaultLanguage: plan.voice?.options?.language,
            defaultTtsProvider: plan.providers?.tts,
            availableProviders: ["chatterbox", "mms", "openai"],
            beats
          })
        }
      ],
      schemaName: "tts_routing_map",
      schema: TTS_ROUTING_SCHEMA,
      errorLabel: "OpenAI TTS routing request failed"
    });

    const routes = new Map((routing.routes ?? []).map((route) => [route.beatId, route]));
    const nextPlan = {
      ...plan,
      sections: (plan.sections ?? []).map((section) => ({
        ...section,
        beats: (section.beats ?? []).map((beat) => {
          const route = routes.get(beat.id);
          if (!route) return beat;
          if (beat.voiceDirection?.source === "user" || beat.directionMeta?.sources?.ttsRouting === "user") return beat;
          const language = String(route.narrationLanguage || "").trim().toLowerCase() || plan.voice?.options?.language || "en";
          const ttsProvider = ["chatterbox", "mms", "openai"].includes(route.ttsProvider) ? route.ttsProvider : plan.providers?.tts;
          return {
            ...beat,
            voiceDirection: {
              ...(beat.voiceDirection || {}),
              language,
              ttsProvider,
              source: "llm"
            },
            direction: {
              ...(beat.direction || {}),
              voice: {
                ...(beat.direction?.voice || {}),
                language,
                ttsProvider,
                source: "llm"
              }
            },
            directionMeta: {
              ...(beat.directionMeta || {}),
              sources: {
                ...(beat.directionMeta?.sources || {}),
                ttsRouting: "llm"
              }
            }
          };
        })
      }))
    };

    return { plan: nextPlan, model, warnings: routing.warnings ?? [] };
  };
}
