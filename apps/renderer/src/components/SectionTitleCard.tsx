import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

type SectionTitleCardProps = {
  title: string;
};

export const SectionTitleCard: React.FC<SectionTitleCardProps> = ({ title }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 10, durationInFrames - 10, durationInFrames], [0, 1, 1, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(180deg, rgba(2,6,23,0.9), rgba(30,41,59,0.78))",
        opacity
      }}
    >
      <div
        style={{
          color: "#f8fafc",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 78,
          fontWeight: 700,
          textAlign: "center",
          padding: "0 120px",
          lineHeight: 1.1
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
