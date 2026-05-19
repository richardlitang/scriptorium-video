import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderBundle } from "@lvstudio/core";
import { CaptionLayer } from "../components/CaptionLayer";
import { MediaLayer } from "../components/MediaLayer";

type RemotionInputProps = {
  renderBundle: RenderBundle;
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};

function dbToVolume(levelDb: number): number {
  const linear = Math.pow(10, levelDb / 20);
  return Math.max(0, Math.min(1, linear));
}

export const VerticalStoryTemplate: React.FC<RemotionInputProps> = ({
  renderBundle,
  assetUrls
}) => {
  const { videoPlan, assetManifest, timeline, captions } = renderBundle;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSeconds = frame / fps;
  const activeSegment =
    timeline.segments.find(
      (segment) => timeSeconds >= segment.startSeconds && timeSeconds < segment.endSeconds
    ) ?? timeline.segments[0];
  const activeBeat = videoPlan.sections
    .flatMap((section) => section.beats)
    .find((beat) => beat.id === activeSegment.beatId);
  const activeMediaId = activeSegment.mediaAssetIds[0];
  const activeMedia = assetManifest.assets.find((asset) => asset.id === activeMediaId);
  const activeMediaUrl = activeMediaId ? assetUrls[activeMediaId] : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "#020617" }}>
      <MediaLayer asset={activeMedia} src={activeMediaUrl} motion={activeBeat?.motion} />
      {timeline.segments.map((segment) => {
        if (!segment.voiceAssetId) return null;
        const src = assetUrls[segment.voiceAssetId];
        if (!src) return null;
        return (
          <Sequence
            key={segment.voiceAssetId}
            from={Math.round(segment.startSeconds * fps)}
            durationInFrames={Math.ceil(segment.durationSeconds * fps)}
          >
            <Audio src={src} />
          </Sequence>
        );
      })}
      {timeline.segments.flatMap((segment) =>
        (segment.audioCues ?? []).map((cue) => {
          const src = assetUrls[cue.assetId];
          if (!src) return null;
          return (
            <Sequence
              key={`${segment.beatId}-${cue.assetId}-${cue.startSeconds}`}
              from={Math.round(cue.startSeconds * fps)}
              durationInFrames={Math.max(1, Math.ceil(cue.durationSeconds * fps))}
            >
              <Audio src={src} volume={dbToVolume(cue.levelDb)} />
            </Sequence>
          );
        })
      )}
      <CaptionLayer captions={captions} />
    </AbsoluteFill>
  );
};
