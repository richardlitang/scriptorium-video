import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionsFile } from "@lvstudio/core";

type CaptionLayerProps = {
  captions?: CaptionsFile;
};

export const CaptionLayer: React.FC<CaptionLayerProps> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSeconds = frame / fps;
  const activeCaption = captions?.captions.find(
    (caption) => timeSeconds >= caption.startSeconds && timeSeconds < caption.endSeconds,
  );

  if (!activeCaption) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0 78px 180px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          color: "#f8fafc",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.08,
          textAlign: "center",
          textShadow: "0 4px 18px rgba(0,0,0,0.8)",
          maxWidth: "100%",
        }}
      >
        {activeCaption.text}
      </div>
    </AbsoluteFill>
  );
};
