import {
  createPlanDraftOrchestrator,
  DEFAULT_PLANNER_SYSTEM_PROMPT,
  DEFAULT_PLANNER_USER_PROMPT_TEMPLATE
} from "./plan-draft-orchestrator.mjs";
import { createTtsRoutingOrchestrator, planNeedsTtsRouting } from "./tts-routing-orchestrator.mjs";

const DEFAULT_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export { DEFAULT_PLANNER_SYSTEM_PROMPT, DEFAULT_PLANNER_USER_PROMPT_TEMPLATE, planNeedsTtsRouting };

export function createOpenAiPlanOrchestrator({
  fetchImpl = fetch,
  getOpenAiApiKey,
  buildPlanFromAiDraft,
  studioTestMode = false,
  openAiResponsesUrl = DEFAULT_OPENAI_RESPONSES_URL
}) {
  return {
    generatePlanDraftWithOpenAi: createPlanDraftOrchestrator({
      fetchImpl,
      getOpenAiApiKey,
      buildPlanFromAiDraft,
      studioTestMode,
      openAiResponsesUrl
    }),
    routePlanTtsWithOpenAi: createTtsRoutingOrchestrator({
      fetchImpl,
      getOpenAiApiKey,
      studioTestMode,
      openAiResponsesUrl
    })
  };
}
