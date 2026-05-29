import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Video } from "remotion";
import type { Asset } from "@lvstudio/core";

type ScaleMode = "safe_cover" | "contain_blur" | "cover" | "contain" | "stretch";
type SubjectPosition = "center" | "upper_center" | "lower_center" | "left" | "right";
type CropRisk = "low" | "medium" | "high";
type MotionType = "none" | "slow_zoom_in" | "slow_zoom_out" | "pan_left" | "pan_right";

type MediaLayerProps = {
  asset?: Asset;
  src?: string;
  localFrame?: number;
  spanDurationInFrames?: number;
  scaleMode?: ScaleMode;
  subjectPosition?: SubjectPosition;
  cropRisk?: CropRisk;
  motion?: { type: MotionType; intensity: number };
};

const CROP_RISK_DAMPING: Record<CropRisk, number> = {
  high: 0.7,
  medium: 0.85,
  low: 1,
};

const SUBJECT_POSITION_ORIGIN: Record<SubjectPosition, string> = {
  center: "50% 50%",
  upper_center: "50% 32%",
  lower_center: "50% 68%",
  left: "32% 50%",
  right: "68% 50%",
};

const SUBJECT_POSITION_OBJECT: Record<SubjectPosition, string> = {
  center: "50% 50%",
  upper_center: "50% 38%",
  lower_center: "50% 62%",
  left: "38% 50%",
  right: "62% 50%",
};

function objectFitForScale(mode: ScaleMode): React.CSSProperties["objectFit"] {
  if (mode === "contain_blur" || mode === "contain") return "contain";
  if (mode === "stretch") return "fill";
  return "cover";
}

function rawTransformForMotion(
  motionType: MotionType | undefined,
  zoomIn: number,
  zoomOut: number,
  dampedPan: number,
): string {
  switch (motionType) {
    case "slow_zoom_out":
      return `scale(${zoomOut})`;
    case "pan_left":
      return `translateX(${-dampedPan}px) scale(1.05)`;
    case "pan_right":
      return `translateX(${dampedPan}px) scale(1.05)`;
    case "none":
      return "none";
    default:
      return `scale(${zoomIn})`;
  }
}

export const MediaLayer: React.FC<MediaLayerProps> = ({
  asset,
  src,
  localFrame,
  spanDurationInFrames,
  scaleMode,
  subjectPosition,
  cropRisk,
  motion,
}) => {
  const compositionFrame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const frame = localFrame ?? compositionFrame;
  const motionDurationInFrames = Math.max(1, spanDurationInFrames ?? durationInFrames);
  const intensity = motion?.intensity ?? 0.12;
  const visualScaleMode = scaleMode ?? "safe_cover";
  const position = subjectPosition ?? "center";
  const cropDamping = CROP_RISK_DAMPING[cropRisk ?? "medium"];
  const transformOrigin = SUBJECT_POSITION_ORIGIN[position];

  const safeZoomMax =
    visualScaleMode === "contain_blur" || visualScaleMode === "contain"
      ? 1.03
      : 1 + intensity * cropDamping;

  const zoomIn = interpolate(frame, [0, motionDurationInFrames], [1, 1 + intensity]);
  const zoomOut = interpolate(frame, [0, motionDurationInFrames], [1 + intensity, 1]);
  const pan = interpolate(frame, [0, motionDurationInFrames], [-intensity * 120, intensity * 120]);
  const dampedPan = pan * cropDamping;

  const rawTransform = rawTransformForMotion(motion?.type, zoomIn, zoomOut, dampedPan);
  const transform =
    rawTransform === "none"
      ? "none"
      : rawTransform.replace(
          /scale\(([\d.]+)\)/g,
          (_, value) => `scale(${Math.min(Number(value), safeZoomMax).toFixed(4)})`,
        );

  if (!asset || !src) {
    return (
      <AbsoluteFill
        style={{ background: "linear-gradient(180deg, #111827 0%, #334155 55%, #0f172a 100%)" }}
      />
    );
  }

  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: objectFitForScale(visualScaleMode),
    objectPosition: SUBJECT_POSITION_OBJECT[position],
    transform,
    transformOrigin,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a", overflow: "hidden" }}>
      {visualScaleMode === "contain_blur" ? (
        <AbsoluteFill
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(28px) brightness(0.7)",
            transform: "scale(1.08)",
          }}
        />
      ) : null}
      {asset.type === "video" || asset.type === "screen_recording" ? (
        <Video src={src} style={style} muted />
      ) : (
        <Img src={src} style={style} />
      )}
      <AbsoluteFill
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.45))" }}
      />
    </AbsoluteFill>
  );
};
