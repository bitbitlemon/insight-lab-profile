import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Card, Selector, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate } from "react-router-dom";
import { getUsageAdminSummary, type UsageAdminSummary } from "../api/usage";
import { PageShell, SectionEmpty, SectionError, SectionLoading, colors } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

const canAccess = (role?: string | null) => role === "admin" || role === "staff";

const metricCardStyle: CSSProperties = {
  border: "1px solid rgba(229,231,235,0.92)",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
  boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const dayOptions: SelectorOption<number>[] = [
  { label: "7 天", value: 7 },
  { label: "14 天", value: 14 },
  { label: "30 天", value: 30 },
];

type RangeMode = "preset" | "custom";

const toDateInputValue = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

const defaultCustomRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
};

const UsageDashboardPage = () => {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [days, setDays] = useState(14);
  const [rangeMode, setRangeMode] = useState<RangeMode>("preset");
  const [customRange, setCustomRange] = useState(() => defaultCustomRange());
  const [summary, setSummary] = useState<UsageAdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (options?: { days?: number; mode?: RangeMode; start?: string; end?: string }) => {
    const mode = options?.mode || rangeMode;
    const nextDays = options?.days || days;
    const start = options?.start || customRange.start;
    const end = options?.end || customRange.end;
    setLoading(true);
    setError("");
    try {
      const params = mode === "custom"
        ? { start_date: start, end_date: end, viewer_window_seconds: 90 }
        : { days: nextDays, viewer_window_seconds: 90 };
      setSummary(await getUsageAdminSummary(params));
    } catch {
      setError("数据后台加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!me) return;
    if (!canAccess(me.role)) {
      setLoading(false);
      setError("没有数据后台权限");
      return;
    }
    void load();
  }, [me?.open_id, me?.role, days, rangeMode]);

  const applyCustomRange = () => {
    const start = new Date(customRange.start);
    const end = new Date(customRange.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      Toast.show({ icon: "fail", content: "请选择有效日期范围" });
      return;
    }
    setRangeMode("custom");
    Toast.show({ icon: "loading", content: "刷新中", duration: 500 });
    void load({ mode: "custom", start: customRange.start, end: customRange.end });
  };

  const totals = useMemo(() => {
    const rows = summary?.daily_metrics || [];
    return {
      activeUsers: rows.reduce((max, item) => Math.max(max, item.active_users), 0),
      cloudLabUsers: rows.reduce((sum, item) => sum + item.cloud_lab_users, 0),
      interactions: rows.reduce((sum, item) => sum + item.interactions, 0),
    };
  }, [summary]);

  const maxBar = useMemo(() => {
    const rows = summary?.daily_metrics || [];
    return Math.max(1, ...rows.flatMap((item) => [item.active_users, item.cloud_lab_users, item.interactions]));
  }, [summary]);

  if (loading) return <PageShell><SectionLoading /></PageShell>;
  if (error) {
    return (
      <PageShell>
        <SectionError
          title={error}
          description="请确认当前账号有后台权限，或稍后重试。"
          action={<Button size="small" onClick={() => load()}>重试</Button>}
        />
      </PageShell>
    );
  }
  if (!summary) return <PageShell><SectionEmpty description="暂无数据" /></PageShell>;

  return (
    <PageShell>
      <div className="app-section-title" style={{ marginBottom: 12 }}>
        <div className="app-section-title__left">
          <div className="app-section-title__headline">数据后台</div>
          <div className="app-section-title__meta">应用使用、云实验室在线和互动统计</div>
        </div>
        <Button size="small" onClick={() => navigate("/admin")}>管理台</Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <div style={metricCardStyle}>
          <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700 }}>正在看云实验室</div>
          <div style={{ color: colors.title, fontSize: 30, fontWeight: 900, marginTop: 4 }}>{summary.current_cloud_lab_viewers}</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>最近 {summary.viewer_window_seconds} 秒心跳</div>
        </div>
        <div style={metricCardStyle}>
          <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700 }}>单日最高使用人数</div>
          <div style={{ color: colors.title, fontSize: 30, fontWeight: 900, marginTop: 4 }}>{totals.activeUsers}</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>按登录用户去重</div>
        </div>
        <div style={metricCardStyle}>
          <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700 }}>云实验室日使用合计</div>
          <div style={{ color: colors.title, fontSize: 30, fontWeight: 900, marginTop: 4 }}>{totals.cloudLabUsers}</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>按天去重后相加</div>
        </div>
        <div style={metricCardStyle}>
          <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700 }}>互动总数</div>
          <div style={{ color: colors.title, fontSize: 30, fontWeight: 900, marginTop: 4 }}>{totals.interactions}</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>鲜花、鸡蛋、鞭子等</div>
        </div>
      </div>

      <Card title="当前云实验室观众" style={{ marginTop: 12 }}>
        {summary.viewers.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {summary.viewers.map((viewer) => (
              <div key={viewer.member_open_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar src={viewer.avatar_url || ""} style={{ "--size": "34px" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: colors.title, fontWeight: 800 }}>{viewer.member_name}</div>
                  <div style={{ color: colors.muted, fontSize: 12 }}>最后心跳 {formatTime(viewer.last_seen_at)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <SectionEmpty description="当前没人停留在云实验室" />
        )}
      </Card>

      <Card
        title="每日趋势"
        style={{ marginTop: 12 }}
        extra={(
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <Selector
              options={dayOptions}
              value={rangeMode === "preset" ? [days] : []}
              onChange={(value) => {
                const next = Number(value[0] || 14);
                setRangeMode("preset");
                setDays(next);
                Toast.show({ icon: "loading", content: "刷新中", duration: 500 });
              }}
              multiple={false}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
              <input
                type="date"
                value={customRange.start}
                onChange={(event) => setCustomRange((prev) => ({ ...prev, start: event.target.value }))}
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 7px", color: colors.title, fontSize: 12, fontWeight: 700 }}
              />
              <span style={{ color: colors.muted, fontSize: 12 }}>至</span>
              <input
                type="date"
                value={customRange.end}
                onChange={(event) => setCustomRange((prev) => ({ ...prev, end: event.target.value }))}
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 7px", color: colors.title, fontSize: 12, fontWeight: 700 }}
              />
              <Button size="mini" color={rangeMode === "custom" ? "primary" : "default"} onClick={applyCustomRange}>应用</Button>
            </div>
          </div>
        )}
      >
        <div style={{ display: "grid", gap: 10 }}>
          {summary.daily_metrics.map((item) => (
            <div key={item.date} style={{ display: "grid", gridTemplateColumns: "86px 1fr", gap: 10, alignItems: "center" }}>
              <div style={{ color: colors.muted, fontSize: 12, fontWeight: 800 }}>{item.date.slice(5)}</div>
              <div style={{ display: "grid", gap: 4 }}>
                {[
                  ["使用", item.active_users, "#4f46e5"],
                  ["云实验室", item.cloud_lab_users, "#0891b2"],
                  ["互动", item.interactions, "#f97316"],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "54px 1fr 34px", gap: 8, alignItems: "center" }}>
                    <span style={{ color: colors.muted, fontSize: 12 }}>{label}</span>
                    <div style={{ height: 8, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                      <div style={{ width: `${(Number(value) / maxBar) * 100}%`, height: "100%", borderRadius: 999, background: color as string }} />
                    </div>
                    <strong style={{ color: colors.title, fontSize: 12, textAlign: "right" }}>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="贪吃蛇排行榜" style={{ marginTop: 12 }}>
        {summary.snake_leaderboard.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {summary.snake_leaderboard.map((score, index) => (
              <div key={score.score_id} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 8, alignItems: "center" }}>
                <strong style={{ color: index < 3 ? colors.warning : colors.muted }}>#{index + 1}</strong>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.title, fontWeight: 800 }}>{score.member_name}</div>
                  <div style={{ color: colors.muted, fontSize: 12 }}>{new Date(score.created_at).toLocaleString("zh-CN")}</div>
                </div>
                <strong style={{ color: colors.primaryDeep, fontSize: 18 }}>{score.score}</strong>
              </div>
            ))}
          </div>
        ) : (
          <SectionEmpty description="还没有贪吃蛇成绩" />
        )}
      </Card>
    </PageShell>
  );
};

export default UsageDashboardPage;
