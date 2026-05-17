import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectPaths, readJsonFile, TimelineSchema, VideoPlanSchema } from "@lvstudio/core";

function formatTimestamp(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function exportProject(projectId: string): Promise<void> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const timeline = await readJsonFile(paths.timeline, TimelineSchema);
  const exportsDir = path.join(paths.projectDir, "exports");
  await mkdir(exportsDir, { recursive: true });

  const chapters = plan.sections
    .map((section) => {
      const firstBeatId = section.beats.sort((a, b) => a.order - b.order)[0]?.id;
      const segment = timeline.segments.find((entry) => entry.beatId === firstBeatId);
      if (!segment) return null;
      return `${formatTimestamp(segment.startSeconds)} ${section.title}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  const description = [
    `# ${plan.title}`,
    "",
    "## Chapters",
    ...chapters.map((chapter) => `- ${chapter}`)
  ].join("\n");

  await writeFile(path.join(exportsDir, "chapters.txt"), `${chapters.join("\n")}\n`, "utf8");
  await writeFile(path.join(exportsDir, "youtube-description.md"), `${description}\n`, "utf8");
  console.log(`Wrote ${path.join(exportsDir, "chapters.txt")}`);
  console.log(`Wrote ${path.join(exportsDir, "youtube-description.md")}`);
}
