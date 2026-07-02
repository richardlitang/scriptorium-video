type StoryDirection = {
  feel: string;
  pacing: string;
  visualStyle: string;
};

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
