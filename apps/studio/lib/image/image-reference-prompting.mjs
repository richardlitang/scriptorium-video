function styleLine(plan) {
  const vb = plan?.visualBible || {};
  return [
    vb.stylePreset ? `Style preset: ${vb.stylePreset}` : "",
    vb.lookAndFeel ? `Look and feel: ${vb.lookAndFeel}` : "",
    Array.isArray(vb.palette) && vb.palette.length > 0 ? `Palette: ${vb.palette.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function characterPrompt(plan, a) {
  const identity = [
    a.role ? `role: ${a.role}` : "",
    a.age ? `age: ${a.age}` : "",
    a.body ? `body: ${a.body}` : "",
    a.face ? `face: ${a.face}` : "",
    a.hair ? `hair: ${a.hair}` : "",
    a.wardrobe ? `wardrobe: ${a.wardrobe}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `Character reference sheet for "${a.name || a.id}".`,
    identity ? `Identity: ${identity}.` : "",
    styleLine(plan),
    "Single character, full body plus a clear head-and-shoulders inset, neutral plain background, even lighting, no other characters, no text, no logos.",
    "This is a canonical identity reference: keep features unambiguous and consistent.",
    a.avoid ? `Avoid: ${a.avoid}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function placePrompt(plan, a, kind) {
  return [
    `${kind === "object" ? "Object" : "Location"} establishing reference for "${a.name || a.id}".`,
    a.description ? `Description: ${a.description}.` : "",
    a.continuityNotes ? `Continuity: ${a.continuityNotes}.` : "",
    styleLine(plan),
    kind === "object"
      ? "Single object, centered, plain background, even lighting, no text, no logos."
      : "Wide establishing shot, no people, clean composition, no text, no logos.",
    a.avoid ? `Avoid: ${a.avoid}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function referencePromptForAnchor(plan, anchor) {
  if (anchor?.kind === "character") return characterPrompt(plan, anchor);
  if (anchor?.kind === "object") return placePrompt(plan, anchor, "object");
  return placePrompt(plan, anchor, "location");
}
