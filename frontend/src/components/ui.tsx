import type { CSSProperties, ReactNode } from "react";
import { Empty, ErrorBlock, SpinLoading } from "antd-mobile";

export const colors = {
  primary: "#6366f1",
  primaryDeep: "#4f46e5",
  primarySoft: "#eef2ff",
  accent: "#8b5cf6",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#ef4444",
  bg: "#f4f7fb",
  panel: "#ffffff",
  panelSoft: "rgba(255,255,255,0.72)",
  border: "#e5e7eb",
  borderSoft: "rgba(229,231,235,0.72)",
  title: "#111827",
  body: "#374151",
  muted: "#6b7280",
  placeholder: "#9ca3af",
  shadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
  shadowSoft: "0 6px 18px rgba(99, 102, 241, 0.08)",
  shadowXs: "0 2px 10px rgba(15,23,42,0.06)",
  shadowSm: "0 8px 20px rgba(15,23,42,0.06)",
};

export const radii = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const space = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const textSizes = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 15,
  xl: 18,
  xxl: 22,
} as const;

export const roleLabels = {
  teacher: "教师",
  student: "学生",
  staff: "职员",
  admin: "管理员",
} as const;

export const roleStyle = {
  teacher: { bg: "#fce7f3", fg: "#9d174d" },
  student: { bg: "#dbeafe", fg: "#1e40af" },
  staff: { bg: "#dcfce7", fg: "#15803d" },
  admin: { bg: "#fef3c7", fg: "#92400e" },
} as const;

export const canAccessAdmin = (role: string, title?: string | null) =>
  role === "admin" || role === "staff" || /团长|政委|部长/.test(title || "");

const globalCss = `
  :root {
    --app-primary: #6366f1;
    --app-primary-deep: #4f46e5;
    --app-bg: #f4f7fb;
    --app-panel: #ffffff;
    --app-border: #e5e7eb;
    --app-title: #111827;
    --app-body: #374151;
    --app-muted: #6b7280;
    --app-placeholder: #9ca3af;
  }

  html, body, #root {
    min-height: 100%;
    background: var(--app-bg);
    color: var(--app-body);
  }

  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  a {
    color: inherit;
  }

  .app-page-shell {
    width: min(100%, 960px);
    margin: 0 auto;
    padding: 16px 16px 24px;
  }

  .adm-card {
    border-radius: 12px;
  }

  .adm-card-body {
    padding: 14px;
  }

  .adm-search-bar {
    --background: #ffffff;
    --border-radius: 12px;
    --height: 42px;
    --placeholder-color: var(--app-placeholder);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
  }

  .adm-search-bar-input-box {
    background: #ffffff;
  }

  .adm-selector {
    gap: 8px;
  }

  .adm-selector-item {
    min-height: 34px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
    color: #4b5563;
    font-size: 12px;
    transition: all 0.18s ease;
  }

  .adm-selector-item-active {
    border-color: rgba(99, 102, 241, 0.18);
    background: rgba(99, 102, 241, 0.1);
    color: var(--app-primary-deep);
  }

  .adm-tabs-header {
    border-bottom: 1px solid rgba(229, 231, 235, 0.9);
  }

  .adm-tabs-tab {
    color: var(--app-muted);
    font-size: 14px;
    transition: color 0.2s ease, transform 0.2s ease;
  }

  .adm-tabs-tab-active {
    color: var(--app-primary-deep);
    font-weight: 600;
    transform: translateY(-1px);
  }

  .adm-tabs-tab-line {
    background: linear-gradient(90deg, #6366f1, #8b5cf6);
    height: 3px;
    border-radius: 999px;
  }

  .app-pressable {
    -webkit-tap-highlight-color: transparent;
    transform: translateZ(0);
    transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .app-pressable:active {
    transform: scale(0.99);
  }

  .app-card-hover:hover {
    border-color: rgba(99,102,241,0.22);
    box-shadow: 0 10px 26px rgba(15,23,42,0.08);
  }

  .app-section-title {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 2px 0;
  }

  .app-section-title__left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .app-section-title__headline {
    color: var(--app-title);
    font-size: 15px;
    line-height: 1.2;
    font-weight: 850;
    letter-spacing: -0.01em;
  }

  .app-section-title__meta {
    color: var(--app-muted);
    font-size: 12px;
    line-height: 1.35;
    font-weight: 600;
  }

  .app-section-title__action {
    border: none;
    background: transparent;
    padding: 6px 6px;
    margin: -6px -6px;
    color: var(--app-primary-deep);
    font-size: 12px;
    font-weight: 750;
    cursor: pointer;
    border-radius: 10px;
  }

  .app-section-title__action:active {
    background: rgba(99,102,241,0.08);
  }

  .adm-tab-bar {
    --item-font-size: 10px;
  }

  .adm-tab-bar-item-title {
    font-size: 10px;
    line-height: 1.2;
  }

  .app-profile-quick-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .adm-form-item-label {
    color: var(--app-title);
    font-weight: 600;
    margin-bottom: 8px;
  }

  .adm-input,
  .adm-text-area {
    --font-size: 14px;
    --color: var(--app-body);
    --placeholder-color: var(--app-placeholder);
  }

  .adm-input-element,
  .adm-text-area-element {
    padding: 12px 14px;
    border-radius: 12px;
    background: #ffffff;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.55);
    border-radius: 999px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  @media (min-width: 768px) {
    .app-page-shell {
      padding: 24px 24px 32px;
    }

    .app-profile-quick-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
`;

export const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(99,102,241,0.08), transparent 30%), linear-gradient(180deg, #f8fbff 0%, #f4f7fb 36%, #f4f7fb 100%)",
};

export const sectionCardStyle: CSSProperties = {
  background: colors.panel,
  borderRadius: radii.lg,
  boxShadow: colors.shadowSm,
  border: `1px solid ${colors.borderSoft}`,
};

export const listItemCardStyle: CSSProperties = {
  background: colors.panel,
  borderRadius: radii.md,
  boxShadow: colors.shadowXs,
  border: `1px solid ${colors.borderSoft}`,
  transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
};

export const chipStyle = (background: string, color: string, fontWeight = 600): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 11,
  lineHeight: 1.3,
  fontWeight,
  background,
  color,
});

export const priorityTone = {
  urgent: {
    label: "紧急",
    shortLabel: "紧急",
    bg: "#fee2e2",
    fg: "#991b1b",
    border: "#ef4444",
    chipBg: "#fecaca",
    chipFg: "#991b1b",
  },
  high: {
    label: "高",
    shortLabel: "重要",
    bg: "#ffedd5",
    fg: "#c2410c",
    border: "#f97316",
    chipBg: "#fed7aa",
    chipFg: "#9a3412",
  },
  medium: {
    label: "中",
    shortLabel: "中",
    bg: "#dbeafe",
    fg: "#1d4ed8",
    border: "#3b82f6",
    chipBg: "#bfdbfe",
    chipFg: "#1d4ed8",
  },
  low: {
    label: "低",
    shortLabel: "低",
    bg: "#f3f4f6",
    fg: "#4b5563",
    border: "#9ca3af",
    chipBg: "#e5e7eb",
    chipFg: "#4b5563",
  },
} as const;

export const getPriorityCardStyle = (
  priority: keyof typeof priorityTone,
  options?: { compact?: boolean },
): CSSProperties => {
  const tone = priorityTone[priority];
  return {
    border: `1px solid ${tone.border}26`,
    borderLeft: `4px solid ${tone.border}`,
    background: tone.bg,
    color: tone.fg,
    borderRadius: 12,
    boxShadow: options?.compact ? "none" : "0 8px 20px rgba(15,23,42,0.04)",
  };
};

export const fmtPoints = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return String(Number(n.toFixed(2)));
};

export const lineClamp = (lines: number): CSSProperties => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
});

export const UiGlobalStyle = () => <style>{globalCss}</style>;

export const SectionHeader = ({
  title,
  meta,
  actionLabel,
  onAction,
}: {
  title: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="app-section-title">
    <div className="app-section-title__left">
      <div className="app-section-title__headline">{title}</div>
      {meta ? <div className="app-section-title__meta">{meta}</div> : null}
    </div>
    {actionLabel && onAction ? (
      <button type="button" className="app-section-title__action app-pressable" onClick={onAction}>
        {actionLabel}
      </button>
    ) : null}
  </div>
);

export const PageShell = ({ children }: { children: ReactNode }) => (
  <div style={pageStyle}>
    <UiGlobalStyle />
    <div className="app-page-shell">{children}</div>
  </div>
);

export const SectionLoading = ({ text = "正在加载..." }: { text?: string }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
      padding: "32px 16px",
      color: colors.muted,
      fontSize: 13,
    }}
  >
    <SpinLoading color="primary" style={{ "--color": colors.primary } as CSSProperties} />
    <span>{text}</span>
  </div>
);

export const SectionEmpty = ({ description }: { description: string }) => (
  <div style={{ padding: "24px 0" }}>
    <Empty
      imageStyle={{ width: 88, height: 88 }}
      description={<span style={{ color: colors.muted, fontSize: 13 }}>{description}</span>}
    />
  </div>
);

export const SectionError = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div
    style={{
      ...sectionCardStyle,
      padding: 14,
    }}
  >
    <ErrorBlock
      status="disconnected"
      title={title}
      description={description}
      style={
        {
          "--title-font-size": "17px",
          "--description-font-size": "13px",
          "--description-color": colors.muted,
        } as CSSProperties
      }
    />
    {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
  </div>
);

export const Avatar = ({
  src,
  name,
  size,
}: {
  src?: string;
  name: string;
  size: number;
}) =>
  src ? (
    <img
      src={src}
      alt={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        border: "2px solid rgba(255,255,255,0.92)",
        boxShadow: "0 8px 20px rgba(99,102,241,0.18)",
      }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(18, Math.round(size * 0.38)),
        flexShrink: 0,
        boxShadow: "0 8px 20px rgba(99,102,241,0.28)",
      }}
    >
      {name.slice(0, 1)}
    </div>
  );
