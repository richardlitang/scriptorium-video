import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderBundle } from "@lvstudio/core";
import { CaptionLayer } from "../components/CaptionLayer";
import { MediaLayer } from "../components/MediaLayer";
import { SectionTitleCard } from "../components/SectionTitleCard";
import { activeSilenceAt, activeVisualCueAt, shouldCutToBlack, visualCueStyle } from "./editorial-runtime";

type RemotionInputProps = {
  renderBundle: RenderBundle;
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};

function dbToVolume(levelDb: number): number {
  const linear = Math.pow(10, levelDb / 20);
  return Math.max(0, Math.min(1, linear));
}

function duckingFactorAt(timeSeconds: number, voiceRanges: Array<{ start: number; end: number }>): number {
  return voiceRanges.some((range) => timeSeconds >= range.start && timeSeconds < range.end) ? 0.35 : 1;
}

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
  const activeSegmentIndex = Math.max(0, timeline.segments.findIndex((segment) => segment === activeSegment));
  const visualEditCues = timeline.segments.flatMap((segment) => segment.visualEditCues ?? []);
  const activeVisualCue = activeVisualCueAt(timeSeconds, visualEditCues);
  const visualSegment = activeVisualCue?.target === "next_visual"
    ? timeline.segments[activeSegmentIndex + 1] ?? activeSegment
    : activeSegment;
  const activeBeat = videoPlan.sections
    .flatMap((section) => section.beats)
    .find((beat) => beat.id === visualSegment.beatId);
  const activeMediaId = visualSegment.mediaAssetIds[0];
  const activeMedia = assetManifest.assets.find((asset) => asset.id === activeMediaId);
  const activeMediaUrl = activeMediaId ? assetUrls[activeMediaId] : undefined;
  const voiceRanges = timeline.segments
    .filter((segment) => Boolean(segment.voiceAssetId))
    .map((segment) => ({ start: segment.startSeconds, end: segment.endSeconds }));
  const silenceWindows = timeline.segments.flatMap((segment) => segment.silenceWindows ?? []);
  const cutToBlack = shouldCutToBlack(timeSeconds, visualEditCues);
  const visualSpans = timeline.segments.reduce<Array<{
    mediaAssetId?: string;
    fromSeconds: number;
    toSeconds: number;
    motion?: {
      type: "none" | "slow_zoom_in" | "slow_zoom_out" | "pan_left" | "pan_right";
      intensity: number;
    };
  }>>((acc, segment) => {
    const beat = videoPlan.sections
      .flatMap((section) => section.beats)
      .find((entry) => entry.id === segment.beatId);
    const mediaAssetId = segment.mediaAssetIds[0];
    const last = acc[acc.length - 1];
    if (last && last.mediaAssetId === mediaAssetId) {
      last.toSeconds = segment.endSeconds;
      return acc;
    }
    acc.push({
      mediaAssetId,
      fromSeconds: segment.startSeconds,
      toSeconds: segment.endSeconds,
      motion: beat?.motion
    });
    return acc;
  }, []);
  const activeVisualSpan = visualSpans.find((span) => timeSeconds >= span.fromSeconds && timeSeconds < span.toSeconds);
  const spanMediaId = activeVisualSpan?.mediaAssetId ?? activeMediaId;
  const spanMedia = assetManifest.assets.find((asset) => asset.id === spanMediaId) ?? activeMedia;
  const spanMediaUrl = spanMediaId ? assetUrls[spanMediaId] : activeMediaUrl;
  const spanFromFrame = Math.round((activeVisualSpan?.fromSeconds ?? visualSegment.startSeconds) * fps);
  const spanDurationFrames = Math.max(
    1,
    Math.round(((activeVisualSpan?.toSeconds ?? visualSegment.endSeconds) - (activeVisualSpan?.fromSeconds ?? visualSegment.startSeconds)) * fps)
  );
  const localVisualFrame = Math.max(0, frame - spanFromFrame);

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
      {cutToBlack ? (
        <AbsoluteFill style={{ backgroundColor: "#000000" }} />
      ) : (
        <AbsoluteFill style={visualCueStyle(activeVisualCue, timeSeconds)}>
          <MediaLayer
            asset={spanMedia}
            src={spanMediaUrl}
            motion={activeVisualSpan?.motion ?? activeBeat?.motion}
            localFrame={localVisualFrame}
            spanDurationInFrames={spanDurationFrames}
          />
        </AbsoluteFill>
      )}

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
            <Audio
              src={src}
              volume={(frameInSequence) => {
                const voiceTime = segment.startSeconds + frameInSequence / fps;
                const voiceSilence = activeSilenceAt(voiceTime, silenceWindows);
                if (voiceSilence && !voiceSilence.keepVoice) return 0;
                return 1;
              }}
            />
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
              <Audio
                src={src}
                volume={(frameInSequence) => {
                  const cueTime = cue.startSeconds + frameInSequence / fps;
                  const baseVolume = dbToVolume(cue.levelDb);
                  const cueSilence = activeSilenceAt(cueTime, silenceWindows);
                  if (cueSilence) {
                    if (cue.role === "music" && cueSilence.muteMusic) return 0;
                    if (cue.role === "sfx" && cueSilence.muteSfx) return 0;
                  }
                  return cue.role === "music"
                    ? baseVolume * duckingFactorAt(cueTime, voiceRanges)
                    : baseVolume;
                }}
              />
            </Sequence>
          );
        })
      )}

      {sectionStarts.map((entry) => (
        <Sequence key={entry.sectionId} from={entry.from} durationInFrames={entry.durationInFrames}>
          <SectionTitleCard title={entry.title} />
        </Sequence>
      ))}

      <CaptionLayer captions={captions} />
    </AbsoluteFill>
  );
};
