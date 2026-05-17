import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderBundle } from "@lvstudio/core";
import { CaptionLayer } from "../components/CaptionLayer";
import { MediaLayer } from "../components/MediaLayer";
import { SectionTitleCard } from "../components/SectionTitleCard";

type RemotionInputProps = {
  renderBundle: RenderBundle;
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};

export const DocumentaryLongformTemplate: React.FC<RemotionInputProps> = ({
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

  const sectionStarts = videoPlan.sections
    .map((section) => {
      const firstBeatId = section.beats.sort((a, b) => a.order - b.order)[0]?.id;
      const segment = timeline.segments.find((entry) => entry.beatId === firstBeatId);
      if (!segment) return null;
      return {
        sectionId: section.id,
        title: section.title,
        from: Math.round(segment.startSeconds * fps),
        durationInFrames: Math.max(30, Math.round(Math.min(2, segment.durationSeconds) * fps))
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

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

      {sectionStarts.map((entry) => (
        <Sequence key={entry.sectionId} from={entry.from} durationInFrames={entry.durationInFrames}>
          <SectionTitleCard title={entry.title} />
        </Sequence>
      ))}

      <CaptionLayer captions={captions} />
    </AbsoluteFill>
  );
};
