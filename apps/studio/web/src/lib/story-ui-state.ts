// Ported from public/modules/story-ui-state.js + story-draft-state.js

export type StoredUiState = {
  story: string;
  feel: string;
  pacing: string;
  visualStyle: string;
  systemPrompt: string;
  userPromptTemplate: string;
  imageEnabled: string;
  imageMode: string;
  imageBudget: string;
  imageQuality: string;
};

export type StoryDirection = {
  feel: string;
  pacing: string;
  visualStyle: string;
};

export type PendingUiState = {
  feel: string;
  pacing: string;
  visualStyle: string;
  systemPrompt: string;
  userPromptTemplate: string;
  imageEnabled: string;
  imageMode: string;
  imageBudget: string;
  imageQuality: string;
};

export function buildStoredUiState(controls: {
  story: string;
  feel: string;
  pacing: string;
  visualStyle: string;
  systemPrompt: string;
  userPromptTemplate: string;
  imageEnabled: boolean;
  imageMode: string;
  imageBudget: string;
  imageQuality: string;
}): StoredUiState {
  return {
    story: controls.story,
    feel: controls.feel,
    pacing: controls.pacing,
    visualStyle: controls.visualStyle,
    systemPrompt: controls.systemPrompt,
    userPromptTemplate: controls.userPromptTemplate,
    imageEnabled: controls.imageEnabled ? "true" : "false",
    imageMode: controls.imageMode,
    imageBudget: controls.imageBudget,
    imageQuality: controls.imageQuality,
  };
}

export function currentStoryDirection(controls: {
  feel: string;
  pacing: string;
  visualStyle: string;
}): StoryDirection {
  return {
    feel: controls.feel.trim(),
    pacing: controls.pacing.trim(),
    visualStyle: controls.visualStyle.trim(),
  };
}
