import { createPlanDraftOrchestrator } from "../draft/plan-draft-orchestrator.mjs";
import {
  DEFAULT_PLANNER_SYSTEM_PROMPT,
  DEFAULT_PLANNER_USER_PROMPT_TEMPLATE,
} from "./planner-defaults.mjs";
import {
  createTtsRoutingOrchestrator,
  planNeedsTtsRouting,
} from "../tts/tts-routing-orchestrator.mjs";

const DEFAULT_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export { DEFAULT_PLANNER_SYSTEM_PROMPT, DEFAULT_PLANNER_USER_PROMPT_TEMPLATE, planNeedsTtsRouting };

export function createOpenAiPlanOrchestrator({
  fetchImpl = fetch,
  getOpenAiApiKey,
  buildPlanFromAiDraft,
  studioTestMode = false,
  openAiResponsesUrl = DEFAULT_OPENAI_RESPONSES_URL,
  plannerRequestConfig,
  ttsRoutingConfig,
}) {
  return {
    generatePlanDraftWithOpenAi: createPlanDraftOrchestrator({
      fetchImpl,
      getOpenAiApiKey,
      buildPlanFromAiDraft,
      studioTestMode,
      openAiResponsesUrl,
      plannerRequestConfig,
    }),
    routePlanTtsWithOpenAi: createTtsRoutingOrchestrator({
      fetchImpl,
      getOpenAiApiKey,
      studioTestMode,
      openAiResponsesUrl,
      ttsRoutingConfig,
    }),
  };
}
