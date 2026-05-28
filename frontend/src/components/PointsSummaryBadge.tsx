import type { CSSProperties } from "react";
import type { PointsSummary } from "../api/common";

const emptyStyle: CSSProperties = {
  background: "#f3f4f6",
  color: "#6b7280",
};

const valueStyle: CSSProperties = {
  background: "#fff7ed",
  color: "#c2410c",
};

const wrapStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 4,
  flexShrink: 0,
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const subLabelStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1,
  color: "#9a3412",
  whiteSpace: "nowrap",
};

export default function PointsSummaryBadge({ summary }: { summary?: PointsSummary | null }) {
  if (!summary) {
    return null;
  }

  const hasPoints = summary.total_final_points > 0;

  return (
    <span style={wrapStyle}>
      <span style={{ ...badgeStyle, ...(hasPoints ? valueStyle : emptyStyle) }}>
        {hasPoints ? `${summary.total_final_points.toFixed(1)} 分` : "未结算"}
      </span>
      {summary.my_final_points > 0 ? (
        <span style={subLabelStyle}>(我 {summary.my_final_points.toFixed(1)})</span>
      ) : null}
    </span>
  );
}
