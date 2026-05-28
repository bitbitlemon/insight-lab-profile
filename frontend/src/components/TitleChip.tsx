const titleChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#f3f4f6",
  color: "#4b5563",
  fontSize: 12,
  lineHeight: 1.4,
  whiteSpace: "nowrap" as const,
};

export function TitleChip({ title }: { title?: string | null }) {
  if (!title) return null;
  return <span style={titleChipStyle}>{title}</span>;
}
