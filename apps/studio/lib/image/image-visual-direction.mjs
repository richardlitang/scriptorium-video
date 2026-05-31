export function imageVisualDirection(plan, section) {
  const projectCreative = plan.direction?.creative || {};
  const sectionCreative = section.direction?.creative || {};
  const visualBible = plan.visualBible || {};
  const allCharacters = Array.isArray(visualBible.characters) ? visualBible.characters : [];
  const allLocations = Array.isArray(visualBible.locations) ? visualBible.locations : [];
  const allObjects = Array.isArray(visualBible.objects) ? visualBible.objects : [];
  return [
    projectCreative.feel ? `Project feel: ${projectCreative.feel}` : "",
    projectCreative.pacing ? `Project pacing: ${projectCreative.pacing}` : "",
    projectCreative.visualStyle ? `Project visual style: ${projectCreative.visualStyle}` : "",
    sectionCreative.feel ? `Section feel: ${sectionCreative.feel}` : "",
    sectionCreative.pacing ? `Section pacing: ${sectionCreative.pacing}` : "",
    sectionCreative.visualStyle ? `Section visual style: ${sectionCreative.visualStyle}` : "",
    visualBible.stylePreset ? `Style preset: ${visualBible.stylePreset}` : "",
    visualBible.lookAndFeel ? `Look and feel: ${visualBible.lookAndFeel}` : "",
    Array.isArray(visualBible.palette) && visualBible.palette.length > 0
      ? `Palette: ${visualBible.palette.join("; ")}`
      : "",
    visualBible.eraAndLocation ? `Era and location: ${visualBible.eraAndLocation}` : "",
    Array.isArray(visualBible.characterAnchors) && visualBible.characterAnchors.length > 0
      ? `Character anchors: ${visualBible.characterAnchors.join("; ")}`
      : "",
    allCharacters.length > 0
      ? `Character bible: ${allCharacters
          .slice(0, 6)
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
    allLocations.length > 0
      ? `Location bible: ${allLocations
          .slice(0, 4)
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
    allObjects.length > 0
      ? `Object bible: ${allObjects
          .slice(0, 6)
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
}
