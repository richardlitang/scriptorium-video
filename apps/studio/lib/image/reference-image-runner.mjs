function anchorsFromPlan(plan) {
  const vb = plan?.visualBible || {};
  const out = [];
  for (const c of Array.isArray(vb.characters) ? vb.characters : []) {
    if (c?.id) out.push({ ...c, kind: "character" });
  }
  for (const l of Array.isArray(vb.locations) ? vb.locations : []) {
    if (l?.id) out.push({ ...l, kind: "location" });
  }
  for (const o of Array.isArray(vb.objects) ? vb.objects : []) {
    if (o?.id) out.push({ ...o, kind: "object" });
  }
  return out;
}

export function createReferenceImageRunner(deps) {
  const {
    generateImageWithOpenAi,
    referencePromptForAnchor,
    sha256,
    readReferenceManifest,
    writeReferenceManifest,
    writeReferenceImage,
    resolveExistingReference,
    defaultImageSizeForPlan,
  } = deps;

  async function ensureReferenceImages(plan, projectId, options = {}) {
    const anchors = anchorsFromPlan(plan);
    const references = new Map();
    const generated = [];
    const skipped = [];
    const manifest = (await readReferenceManifest(projectId)) || {
      schemaVersion: 1,
      references: {},
    };
    const nextReferences = { ...(manifest.references || {}) };
    const size = options.size || defaultImageSizeForPlan(plan);
    const quality = options.quality || "low";

    for (const anchor of anchors) {
      const existing = nextReferences[anchor.id];
      if (existing && existing.locked !== false && typeof resolveExistingReference === "function") {
        const absolutePath = await resolveExistingReference(projectId, existing).catch(() => null);
        if (absolutePath) {
          references.set(anchor.id, {
            absolutePath,
            kind: existing.kind,
            sha256: existing.sha256,
          });
          skipped.push(anchor.id);
          continue;
        }
      }
      const prompt = referencePromptForAnchor(plan, anchor);
      const { bytes } = await generateImageWithOpenAi({ prompt, size, quality });
      const { relativePath, absolutePath } = await writeReferenceImage(projectId, anchor.id, bytes);
      const entry = {
        anchorId: anchor.id,
        kind: anchor.kind,
        path: relativePath,
        sha256: sha256(bytes),
        prompt,
        generatedAt: new Date().toISOString(),
        locked: true,
      };
      nextReferences[anchor.id] = entry;
      references.set(anchor.id, { absolutePath, kind: anchor.kind, sha256: entry.sha256 });
      generated.push(anchor.id);
    }

    await writeReferenceManifest(projectId, { schemaVersion: 1, references: nextReferences });
    return { references, generated, skipped };
  }

  return { ensureReferenceImages };
}
