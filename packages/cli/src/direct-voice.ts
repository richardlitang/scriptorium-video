import { readFile } from "node:fs/promises";
import {
  applyVoiceDirectionPlan,
  getProjectPaths,
  resolveOpenAiApiKey,
  readJsonFile,
  type VideoPlan,
  VideoPlanSchema,
  VoiceDirectorOutputSchema,
  writeJsonFile,
} from "@lvstudio/core";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type DirectVoiceOptions = {
  fromFile?: string;
  provider?: string;
  force?: boolean;
};

type VoiceDirectorResponse = {
  beats: Array<{
    beatId: string;
    voiceDirection: {
      profile: string;
      deliveryNote?: string;
      emphasis?: string[];
      pauseBeforeMs?: number;
      pauseAfterMs?: number;
      intensity?: number;
      source?: "llm";
    };
    captionEmphasis?: string[];
    sfxCues?: Array<{
      id: string;
      kind: string;
      placement: "beat_start" | "beat_end" | "key_point" | "manual";
      offsetSeconds: number;
      levelDb: number;
      assetId?: string;
    }>;
  }>;
};

async function getOpenAiApiKey(): Promise<string> {
  return resolveOpenAiApiKey();
}

function buildVoicePrompt(plan: VideoPlan): string {
  const beats = plan.sections.flatMap((section) =>
    section.beats.map((beat) => ({
      beatId: beat.id,
      sectionId: section.id,
      sectionTitle: section.title,
      narration: beat.narration,
      currentCaptionEmphasis: beat.caption?.emphasis ?? [],
    })),
  );

  return [
    "You are assigning voice direction for an AI video plan.",
    "Choose one profile per beat from:",
    "neutral, warm_open, clear_explainer, authoritative, energetic, key_point, reflective, tense, reveal, urgent, soft_close.",
    "Return concise delivery notes and practical pause timing.",
    "Use pauseBeforeMs and pauseAfterMs in range 0..1200.",
    "Do not output provider-specific values like temperature, cfg_weight, or exaggeration.",
    "",
    "Beats:",
    JSON.stringify(beats, null, 2),
  ].join("\n");
}

function parseOutputText(responseJson: any): string {
  const directText = responseJson?.output_text;
  if (typeof directText === "string" && directText.trim()) return directText;

  const contentParts = (responseJson?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .map((part: any) => part?.text)
    .filter((text: any) => typeof text === "string" && text.trim());

  if (contentParts.length > 0) return contentParts.join("\n");
  throw new Error("OpenAI response did not include text output.");
}

async function generateVoiceDirectionWithOpenAI(plan: VideoPlan): Promise<VoiceDirectorResponse> {
  const apiKey = await getOpenAiApiKey();
  const model = process.env.OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
  const prompt = buildVoicePrompt(plan);

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "voice_direction_output",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              beats: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    beatId: { type: "string" },
                    voiceDirection: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        profile: { type: "string" },
                        deliveryNote: { type: "string" },
                        emphasis: { type: "array", items: { type: "string" } },
                        pauseBeforeMs: { type: "number" },
                        pauseAfterMs: { type: "number" },
                        intensity: { type: "number" },
                        source: { type: "string" },
                      },
                      required: ["profile"],
                    },
                    captionEmphasis: {
                      type: "array",
                      items: { type: "string" },
                    },
                    sfxCues: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          id: { type: "string" },
                          kind: { type: "string" },
                          placement: { type: "string" },
                          offsetSeconds: { type: "number" },
                          levelDb: { type: "number" },
                          assetId: { type: "string" },
                        },
                        required: ["id", "kind", "placement", "offsetSeconds", "levelDb"],
                      },
                    },
                  },
                  required: ["beatId", "voiceDirection"],
                },
              },
            },
            required: ["beats"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voice direction request failed: ${response.status} ${body.slice(0, 400)}`);
  }

  const json = await response.json();
  const outputText = parseOutputText(json);
  const parsed = JSON.parse(outputText) as VoiceDirectorResponse;

  return {
    beats: parsed.beats.map((beat) => ({
      ...beat,
      voiceDirection: {
        ...beat.voiceDirection,
        source: "llm",
      },
    })),
  };
}

export async function directVoice(
  projectId: string,
  options: DirectVoiceOptions = {},
): Promise<void> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);

  let output: VoiceDirectorResponse;
  if (options.fromFile) {
    const raw = await readFile(options.fromFile, "utf8");
    output = JSON.parse(raw) as VoiceDirectorResponse;
  } else {
    const provider = options.provider ?? "openai";
    if (provider !== "openai") {
      throw new Error(`Unsupported direct:voice provider: ${provider}`);
    }
    output = await generateVoiceDirectionWithOpenAI(plan);
  }

  const parsed = VoiceDirectorOutputSchema.parse(output);
  const nextPlan = applyVoiceDirectionPlan(plan, parsed, { force: options.force });
  await writeJsonFile(paths.videoPlan, VideoPlanSchema.parse(nextPlan));
  console.log(`Directed voice for ${projectId}: ${parsed.beats.length} beat updates.`);
}
