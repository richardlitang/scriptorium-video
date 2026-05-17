import { getProjectPaths, loadProject, readJsonFile, TimelineSchema, hashFile } from "@lvstudio/core";

export async function projectStatus(projectId: string): Promise<void> {
  const paths = getProjectPaths(projectId);
  const loaded = await loadProject(projectId);
  let timelineHashStatus: "missing" | "matches" | "stale" = "missing";
  if (loaded.timeline) {
    const currentHash = await hashFile(paths.videoPlan);
    timelineHashStatus = loaded.timeline.sourcePlanHash === currentHash ? "matches" : "stale";
  }

  const timeline = loaded.timeline ?? (await readJsonFile(paths.timeline, TimelineSchema).catch(() => undefined));
  const voiceAssets = loaded.assetManifest.assets.filter((asset) => asset.role === "voiceover").length;
  const mediaAssets = loaded.assetManifest.assets.filter((asset) => asset.role !== "voiceover").length;

  console.log(
    JSON.stringify(
      {
        id: loaded.project.id,
        title: loaded.project.title,
        status: loaded.project.status,
        mode: loaded.videoPlan.mode,
        targetPlatform: loaded.videoPlan.targetPlatform,
        renderer: loaded.videoPlan.providers.renderer,
        sections: loaded.videoPlan.sections.length,
        beats: loaded.videoPlan.sections.reduce((sum, section) => sum + section.beats.length, 0),
        assets: {
          total: loaded.assetManifest.assets.length,
          voice: voiceAssets,
          media: mediaAssets
        },
        timeline: timeline
          ? {
              segments: timeline.segments.length,
              durationSeconds: timeline.durationSeconds,
              sourcePlanHash: timelineHashStatus
            }
          : {
              missing: true
            },
        captions: {
          present: Boolean(loaded.captions),
          count: loaded.captions?.captions.length ?? 0
        }
      },
      null,
      2
    )
  );
}
