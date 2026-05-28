import type { CSSProperties } from "react";
import { Dialog } from "antd-mobile";
import type { PointsSummary, PointsSummaryEntry } from "../api/common";

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
  border: "none",
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

const fmt = (value: number | null | undefined): string => Number(value || 0).toFixed(1);

export const pointsFormulaText = (entry: {
  base_points: number;
  share_ratio: number;
  decay_factor?: number;
  cap_adjustment_factor?: number;
  final_points: number;
}): string => {
  const decay = entry.decay_factor ?? 1;
  const cap = entry.cap_adjustment_factor ?? 1;
  return `${fmt(entry.base_points)} x ${(entry.share_ratio * 100).toFixed(1)}% x ${decay.toFixed(2)} x ${cap.toFixed(2)} = ${fmt(entry.final_points)}`;
};

const detailLine = (entry: PointsSummaryEntry) => (
  <div key={`${entry.member_open_id}-${entry.final_points}-${entry.reason || ""}`} style={{ padding: "10px 0", borderBottom: "1px solid #eef2f7" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{entry.member_name || "未匹配成员"}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#c2410c" }}>{fmt(entry.final_points)} 分</span>
    </div>
    <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>{pointsFormulaText(entry)}</div>
    {entry.reason ? <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{entry.reason}</div> : null}
  </div>
);

const showDetails = (summary: PointsSummary) => {
  const entries = summary.entries || [];
  void Dialog.alert({
    title: "积分计算过程",
    content: (
      <div style={{ textAlign: "left", maxHeight: "62vh", overflowY: "auto" }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
          总分 {fmt(summary.total_final_points)}，参与 {summary.member_count} 人。
        </div>
        {entries.length > 0 ? entries.map(detailLine) : <div style={{ color: "#6b7280", fontSize: 13 }}>暂无可展示的积分明细。</div>}
      </div>
    ),
    confirmText: "知道了",
  });
};

export default function PointsSummaryBadge({ summary }: { summary?: PointsSummary | null }) {
  if (!summary) {
    return null;
  }

  const hasPoints = summary.total_final_points > 0;

  return (
    <span style={wrapStyle}>
      <button
        type="button"
        onClick={() => showDetails(summary)}
        style={{ ...badgeStyle, ...(hasPoints ? valueStyle : emptyStyle), cursor: "pointer" }}
      >
        {hasPoints ? `${summary.total_final_points.toFixed(1)} 分` : "未结算"}
      </button>
      {summary.my_final_points > 0 ? (
        <span style={subLabelStyle}>(我 {summary.my_final_points.toFixed(1)})</span>
      ) : null}
    </span>
  );
}
