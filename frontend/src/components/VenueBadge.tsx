type Style = {
  bg: string;
  fg: string;
  border?: string;
};

const colorFor = (label: string): Style => {
  if (/中科院.*一区/.test(label)) return { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" };
  if (/中科院.*二区/.test(label)) return { bg: "#ffedd5", fg: "#c2410c", border: "#fdba74" };
  if (/中科院.*三区/.test(label)) return { bg: "#dbeafe", fg: "#1d4ed8", border: "#93c5fd" };
  if (/中科院.*四区/.test(label)) return { bg: "#e5e7eb", fg: "#374151", border: "#9ca3af" };
  if (/JCR\s*Q1/i.test(label)) return { bg: "#fce7f3", fg: "#be185d", border: "#f9a8d4" };
  if (/JCR\s*Q2/i.test(label)) return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" };
  if (/JCR\s*Q3/i.test(label)) return { bg: "#cffafe", fg: "#0e7490", border: "#67e8f9" };
  if (/JCR\s*Q4/i.test(label)) return { bg: "#f3f4f6", fg: "#4b5563", border: "#d1d5db" };
  if (/CSSCI/i.test(label)) return { bg: "#ede9fe", fg: "#5b21b6", border: "#c4b5fd" };
  if (/北大核心/.test(label)) return { bg: "#dcfce7", fg: "#15803d", border: "#86efac" };
  if (/CCF\s*[ABCT]/i.test(label)) return { bg: "#fef9c3", fg: "#854d0e", border: "#fde047" };
  return { bg: "#f3f4f6", fg: "#4b5563", border: "#d1d5db" };
};

const tokenize = (s: string): string[] => {
  return s
    .split(/\s*[·/／]\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
};

interface Props {
  venueLevel?: string | null;
  size?: "sm" | "md";
}

const VenueBadge = ({ venueLevel, size = "sm" }: Props) => {
  if (!venueLevel || venueLevel === "无") return null;
  const tokens = tokenize(venueLevel);
  if (tokens.length === 0) return null;
  const fontSize = size === "sm" ? 11 : 13;
  const padding = size === "sm" ? "3px 8px" : "4px 10px";
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {tokens.map((t) => {
        const c = colorFor(t);
        return (
          <span
            key={t}
            style={{
              display: "inline-block",
              fontSize,
              padding,
              borderRadius: 999,
              backgroundColor: c.bg,
              color: c.fg,
              border: `1px solid ${c.border}`,
              lineHeight: 1.35,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </span>
        );
      })}
    </span>
  );
};

export default VenueBadge;
