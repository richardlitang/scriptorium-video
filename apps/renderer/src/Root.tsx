import { Composition, type CalculateMetadataFunction } from "remotion";
import { DocumentaryLongformTemplate } from "./templates/DocumentaryLongformTemplate";
import { VerticalStoryTemplate } from "./templates/VerticalStoryTemplate";
import type { RenderBundle } from "@lvstudio/core";

type RemotionInputProps = {
  renderBundle: RenderBundle;
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};

const defaultProps: RemotionInputProps = {
  renderBundle: {
    project: {
      schemaVersion: 1,
      id: "default",
      title: "Default",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      status: "draft"
    },
    videoPlan: {
    schemaVersion: 1,
    title: "Default",
    mode: "short_story",
    targetPlatform: "local_only",
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
      voiceId: "manual",
      format: "wav",
      options: {}
    },
    sections: [
      {
        id: "intro",
        title: "Intro",
        beats: [
          {
            id: "intro-001",
            order: 1,
            narration: "Default narration",
            timing: { mediaPolicy: "loop_or_freeze", locked: false },
            media: [],
            motion: { type: "slow_zoom_in", intensity: 0.1 },
            caption: { emphasis: [], style: "default" }
          }
        ]
      }
    ]
    },
    assetManifest: {
      schemaVersion: 1,
      assets: []
    },
    timeline: {
      schemaVersion: 1,
      generatedAt: new Date(0).toISOString(),
      sourcePlanHash: "default",
      fps: 30,
      width: 1080,
      height: 1920,
      durationSeconds: 3,
      segments: [
        {
          sectionId: "intro",
          beatId: "intro-001",
          startSeconds: 0,
          endSeconds: 3,
          durationSeconds: 3,
          mediaAssetIds: [],
          renderPolicy: {
            mediaPolicy: "loop_or_freeze",
            scaleMode: "cover"
          }
        }
      ]
    },
    resolvedConfig: {
      fps: 30,
      aspectRatio: "9:16",
      resolution: {
        width: 1080,
        height: 1920
      },
      templateId: "vertical-story"
    }
  },
  quality: "draft",
  assetUrls: {}
};

const calculateMetadata: CalculateMetadataFunction<RemotionInputProps> = ({ props }) => ({
  durationInFrames: Math.max(
    1,
    Math.ceil(props.renderBundle.timeline.durationSeconds * props.renderBundle.timeline.fps)
  ),
  fps: props.renderBundle.timeline.fps,
  width: props.renderBundle.timeline.width,
  height: props.renderBundle.timeline.height,
  props
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="vertical-story"
        component={VerticalStoryTemplate}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="documentary-longform"
        component={DocumentaryLongformTemplate}
        durationInFrames={1800}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
