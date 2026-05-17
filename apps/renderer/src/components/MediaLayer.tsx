import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Video } from "remotion";
import type { Asset } from "@lvstudio/core";

type MediaLayerProps = {
  asset?: Asset;
  src?: string;
  motion?: {
    type: "none" | "slow_zoom_in" | "slow_zoom_out" | "pan_left" | "pan_right";
    intensity: number;
  };
};

export const MediaLayer: React.FC<MediaLayerProps> = ({ asset, src, motion }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const intensity = motion?.intensity ?? 0.08;
  const zoomIn = interpolate(frame, [0, durationInFrames], [1, 1 + intensity]);
  const zoomOut = interpolate(frame, [0, durationInFrames], [1 + intensity, 1]);
  const pan = interpolate(frame, [0, durationInFrames], [-intensity * 120, intensity * 120]);

  const transform =
    motion?.type === "slow_zoom_out"
      ? `scale(${zoomOut})`
      : motion?.type === "pan_left"
        ? `translateX(${-pan}px) scale(1.05)`
        : motion?.type === "pan_right"
          ? `translateX(${pan}px) scale(1.05)`
          : motion?.type === "none"
            ? "none"
            : `scale(${zoomIn})`;

  if (!asset || !src) {
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, #111827 0%, #334155 55%, #0f172a 100%)"
        }}
      />
    );
  }

  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a", overflow: "hidden" }}>
      {asset.type === "video" || asset.type === "screen_recording" ? (
        <Video src={src} style={style} muted />
      ) : (
        <Img src={src} style={style} />
      )}
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.45))"
        }}
      />
    </AbsoluteFill>
  );
};
