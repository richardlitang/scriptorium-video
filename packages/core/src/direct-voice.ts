import { readFile } from "node:fs/promises";
import type { VideoPlan } from "./schemas/video-plan.schema.js";
import { VideoPlanSchema } from "./schemas/video-plan.schema.js";
import {
  VoiceDirectorOutputSchema,
  type VoiceDirectorOutput,
} from "./schemas/voice-director.schema.js";
import { getProjectPaths } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { resolveOpenAiApiKey } from "./openai-api-key.js";
import { normalizeVideoPlan } from "./normalize-video-plan.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type ApplyVoiceDirectionOptions = {
  force?: boolean;
};

export type DirectVoiceProjectOptions = {
  rootDir?: string;
  fromFile?: string;
  provider?: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  model?: string;
  readFileImpl?: typeof readFile;
  resolveOpenAiApiKeyImpl?: typeof resolveOpenAiApiKey;
};

export type DirectVoiceProjectResult = {
  beatUpdates: number;
  videoPlanPath: string;
};

function isLocked(lockedPaths: string[] | undefined, path: string): boolean {
  return Array.isArray(lockedPaths) && lockedPaths.includes(path);
}

function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
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

function objectValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? value[key as keyof typeof value] : undefined;
}

function textParts(value: unknown): string[] {
  const output = objectValue(value, "output");
  if (!Array.isArray(output)) return [];
  return output
    .flatMap((item) => {
      const content = objectValue(item, "content");
      return Array.isArray(content) ? content : [];
    })
    .map((part) => objectValue(part, "text"))
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0);
}

function parseOutputText(responseJson: unknown): string {
  const directText = objectValue(responseJson, "output_text");
  if (typeof directText === "string" && directText.trim()) return directText;

  const parts = textParts(responseJson);
  if (parts.length > 0) return parts.join("\n");
  throw new Error("OpenAI response did not include text output.");
}

async function generateVoiceDirectionWithOpenAI(
  plan: VideoPlan,
  {
    fetchImpl,
    apiKey,
    model,
  }: {
    fetchImpl: typeof fetch;
    apiKey: string;
    model: string;
  },
): Promise<VoiceDirectorOutput> {
  const prompt = buildVoicePrompt(plan);
  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
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

  const outputText = parseOutputText(await response.json());
  const parsed = VoiceDirectorOutputSchema.parse(JSON.parse(outputText));
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

export function applyVoiceDirectionPlan(
  videoPlan: VideoPlan,
  directionOutput: VoiceDirectorOutput,
  options: ApplyVoiceDirectionOptions = {},
): VideoPlan {
  const parsed = VoiceDirectorOutputSchema.parse(directionOutput);
  const byBeatId = new Map(parsed.beats.map((entry) => [entry.beatId, entry]));

  return {
    ...videoPlan,
    sections: videoPlan.sections.map((section) => ({
      ...section,
      beats: section.beats.map((beat) => {
        const next = byBeatId.get(beat.id);
        if (!next) return beat;

        const existingVoice = beat.direction?.voice;
        const shouldPreserveUserDirection = !options.force && existingVoice?.source === "user";
        const beatLockedPaths = beat.directionMeta?.lockedPaths;
        const lockVoiceDirection = !options.force && isLocked(beatLockedPaths, "voice");
        const lockSfx = !options.force && isLocked(beatLockedPaths, "sfx");
        const lockCaptionEmphasis = !options.force && isLocked(beatLockedPaths, "caption.emphasis");
        const newVoice =
          shouldPreserveUserDirection || lockVoiceDirection ? existingVoice : next.voiceDirection;
        const existingSfxCues = beat.direction?.sfxCues ?? [];
        let newSfxCues = existingSfxCues;
        if (!lockSfx && next.sfxCues.length > 0) newSfxCues = next.sfxCues;

        return {
          ...beat,
          direction: {
            ...(beat.direction || {}),
            ...(newVoice ? { voice: newVoice } : {}),
            sfxCues: newSfxCues,
          },
          directionMeta: {
            ...(beat.directionMeta || {}),
            lockedPaths: beat.directionMeta?.lockedPaths ?? [],
            sources: {
              ...(beat.directionMeta?.sources || {}),
              voice: newVoice?.source === "user" ? "user" : "llm",
              sfx: lockSfx ? beat.directionMeta?.sources?.sfx || "user" : "llm",
              "caption.emphasis": lockCaptionEmphasis
                ? beat.directionMeta?.sources?.["caption.emphasis"] || "user"
                : "llm",
            },
          },
          caption: {
            ...beat.caption,
            emphasis: lockCaptionEmphasis
              ? (beat.caption?.emphasis ?? [])
              : uniqueStrings([
                  ...(beat.caption?.emphasis ?? []),
                  ...(next.captionEmphasis ?? []),
                  ...(next.voiceDirection.emphasis ?? []),
                ]),
          },
        };
      }),
    })),
  };
}

export async function directVoiceProject(
  projectId: string,
  options: DirectVoiceProjectOptions = {},
): Promise<DirectVoiceProjectResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const paths = getProjectPaths(projectId, rootDir);
  const plan = normalizeVideoPlan(await readJsonFile(paths.videoPlan, VideoPlanSchema));

  let output: VoiceDirectorOutput;
  if (options.fromFile) {
    const raw = await (options.readFileImpl ?? readFile)(options.fromFile, "utf8");
    output = VoiceDirectorOutputSchema.parse(JSON.parse(raw));
  } else {
    const provider = options.provider ?? "openai";
    if (provider !== "openai") throw new Error(`Unsupported direct:voice provider: ${provider}`);
    const env = options.env ?? process.env;
    const apiKey = await (options.resolveOpenAiApiKeyImpl ?? resolveOpenAiApiKey)({
      env,
      rootDir,
    });
    output = await generateVoiceDirectionWithOpenAI(plan, {
      fetchImpl: options.fetchImpl ?? fetch,
      apiKey,
      model: options.model ?? env.OPENAI_PLANNER_MODEL ?? "gpt-4o-mini",
    });
  }

  const parsed = VoiceDirectorOutputSchema.parse(output);
  const nextPlan = applyVoiceDirectionPlan(plan, parsed, { force: options.force });
  await writeJsonFile(paths.videoPlan, VideoPlanSchema.parse(nextPlan));
  return { beatUpdates: parsed.beats.length, videoPlanPath: paths.videoPlan };
}
