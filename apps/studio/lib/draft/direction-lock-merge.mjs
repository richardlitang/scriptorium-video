function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isLocked(meta, path) {
  return Array.isArray(meta?.lockedPaths) && meta.lockedPaths.includes(path);
}

export function mergeDirectionWithLocks(
  previousDirection,
  previousMeta,
  nextDirection,
  nextSources = {},
) {
  const merged = clone(nextDirection) || {};
  const previous = previousDirection || {};
  if (isLocked(previousMeta, "creative")) {
    merged.creative = clone(previous.creative);
  } else if (
    isLocked(previousMeta, "creative.feel") ||
    isLocked(previousMeta, "creative.pacing") ||
    isLocked(previousMeta, "creative.visualStyle")
  ) {
    merged.creative = merged.creative || {};
    if (isLocked(previousMeta, "creative.feel")) merged.creative.feel = previous.creative?.feel;
    if (isLocked(previousMeta, "creative.pacing"))
      merged.creative.pacing = previous.creative?.pacing;
    if (isLocked(previousMeta, "creative.visualStyle"))
      merged.creative.visualStyle = previous.creative?.visualStyle;
  }
  if (isLocked(previousMeta, "voice")) merged.voice = clone(previous.voice);
  if (isLocked(previousMeta, "caption")) merged.caption = clone(previous.caption);
  if (isLocked(previousMeta, "caption.emphasis")) {
    merged.caption = merged.caption || {};
    merged.caption.emphasis = clone(previous.caption?.emphasis) || [];
  }
  if (isLocked(previousMeta, "caption.style")) {
    merged.caption = merged.caption || {};
    merged.caption.style = previous.caption?.style;
  }
  if (isLocked(previousMeta, "caption.tuning")) {
    merged.caption = merged.caption || {};
    merged.caption.tuning = clone(previous.caption?.tuning);
  }
  if (isLocked(previousMeta, "motion")) merged.motion = clone(previous.motion);
  if (isLocked(previousMeta, "sfx")) merged.sfxCues = clone(previous.sfxCues) || [];
  if (isLocked(previousMeta, "editorial")) merged.editorial = clone(previous.editorial);
  return {
    direction: merged,
    directionMeta: {
      lockedPaths: previousMeta?.lockedPaths || [],
      sources: {
        ...(previousMeta?.sources || {}),
        ...nextSources,
      },
    },
  };
}
