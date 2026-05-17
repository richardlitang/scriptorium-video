import { mkdir } from "node:fs/promises";
import path from "node:path";
import { writeJsonFile } from "@lvstudio/core";
import type { TargetPlatformSchema, VideoModeSchema } from "@lvstudio/core";
import type { z } from "zod";

type Mode = z.infer<typeof VideoModeSchema>;
type Platform = z.infer<typeof TargetPlatformSchema>;

export async function createProject(
  projectId: string,
  mode: Mode,
  platform: Platform,
  rootDir = process.cwd()
): Promise<void> {
  const now = new Date().toISOString();
  const projectDir = path.resolve(rootDir, "content", "projects", projectId);
  await mkdir(path.join(projectDir, "assets", "images"), { recursive: true });
  await mkdir(path.join(projectDir, "assets", "audio", "voice"), { recursive: true });
  await mkdir(path.join(projectDir, "captions"), { recursive: true });
  await mkdir(path.join(projectDir, "renders"), { recursive: true });

  await writeJsonFile(path.join(projectDir, "project.json"), {
    schemaVersion: 1,
    id: projectId,
    title: projectId,
    createdAt: now,
    updatedAt: now,
    status: "draft"
  });

  await writeJsonFile(path.join(projectDir, "video-plan.json"), {
    schemaVersion: 1,
    title: projectId,
    mode,
    targetPlatform: platform,
    stylePackId: "default",
    templateId: "vertical-story",
    overrides: {},
    providers: {
      llm: "manual",
      tts: "manual",
      transcription: "manual",
      media: "manual-media",
      renderer: "remotion"
    },
    voice: {
      provider: "manual",
      voiceId: "manual-voice",
      format: "wav",
      options: {}
    },
    sections: [
      {
        id: "intro",
        title: "Intro",
        purpose: "Open the story.",
        beats: [
          {
            id: "intro-001",
            order: 1,
            narration: "Replace this narration with your first beat.",
            timing: {
              estimatedDurationSeconds: 4,
              mediaPolicy: "loop_or_freeze"
            },
            media: [
              {
                id: "intro-001-visual",
                type: "image",
                role: "primary_visual",
                localPath: "assets/images/intro-001.svg",
                scaleMode: "cover",
                placement: "background"
              }
            ]
          }
        ]
      }
    ]
  });

  await writeJsonFile(path.join(projectDir, "asset-manifest.json"), {
    schemaVersion: 1,
    assets: []
  });
}
