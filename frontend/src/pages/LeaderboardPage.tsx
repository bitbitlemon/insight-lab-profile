import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Card } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { getPointsLeaderboard, type LeaderboardItem } from "../api/points";
import { listMembers } from "../api/members";
import { getMemberProfilePath } from "../components/MemberProfileLink";
import { Avatar, PageShell, SectionEmpty, SectionLoading, chipStyle, colors, fmtPoints, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Member } from "../types/api";

const rankCardStyles: Record<number, CSSProperties> = {
  1: { background: "linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%)", color: "#92400e" },
  2: { background: "linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%)", color: "#374151" },
  3: { background: "linear-gradient(135deg, #fde68a 0%, #d97706 100%)", color: "#7c2d12" },
};

const fetchAllMembers = async (): Promise<Member[]> => {
  const firstPage = await listMembers({ page: 1, page_size: 100 });
  const totalPages = Math.ceil(firstPage.total / firstPage.page_size);

  if (totalPages <= 1) {
    return firstPage.items;
  }

  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listMembers({ page: index + 2, page_size: firstPage.page_size })),
  );

  return firstPage.items.concat(restPages.flatMap((page) => page.items));
};

const LeaderboardPage = () => {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [department, setDepartment] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setDepartmentsLoading(true);

    fetchAllMembers()
      .then((members) => {
        if (!active) {
          return;
        }

        const uniqueDepartments = Array.from(
          new Set(
            members
              .map((member) => member.department?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        ).sort((left, right) => left.localeCompare(right, "zh-CN"));

        setDepartments(uniqueDepartments);
      })
      .catch(() => {
        if (active) {
          setDepartments([]);
        }
      })
      .finally(() => {
        if (active) {
          setDepartmentsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setListLoading(true);

    getPointsLeaderboard({ department: department || undefined, limit: 50 })
      .then((response) => {
        if (active) {
          setItems(response);
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
        }
      })
      .finally(() => {
        if (active) {
          setListLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [department]);

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: colors.title }}>积分排行榜</div>
          <div style={{ marginTop: 6, color: colors.muted, fontSize: 13 }}>按成员积分总分查看当前排名</div>
        </div>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700 }}>部门筛选</div>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              style={{
                width: "100%",
                minHeight: 42,
                borderRadius: 12,
                border: "1px solid rgba(229,231,235,0.9)",
                padding: "0 12px",
                background: "#ffffff",
                color: colors.body,
                fontSize: 14,
                outline: "none",
              }}
            >
              <option value="">全部</option>
              {departments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {departmentsLoading ? <div style={{ color: colors.muted, fontSize: 12 }}>正在加载部门...</div> : null}
          </div>
        </Card>

        <Card style={sectionCardStyle}>
          {listLoading ? <SectionLoading text="正在加载积分排行榜..." /> : null}
          {!listLoading && items.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map((item) => {
                const rankStyle = rankCardStyles[item.rank];
                const isTopThree = Boolean(rankStyle);

                return (
                  <button
                    key={item.member_open_id}
                    type="button"
                    onClick={() => navigate(getMemberProfilePath(item.member_open_id, me?.open_id))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        minWidth: 52,
                        height: 52,
                        borderRadius: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: isTopThree ? 24 : 22,
                        fontWeight: 800,
                        letterSpacing: "-0.02em",
                        background: isTopThree ? rankStyle.background : "#f8fafc",
                        color: isTopThree ? rankStyle.color : colors.title,
                        boxShadow: isTopThree ? "0 10px 22px rgba(15,23,42,0.08)" : "inset 0 0 0 1px rgba(229,231,235,0.9)",
                      }}
                    >
                      {item.rank}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
                        border: "1px solid rgba(229,231,235,0.9)",
                        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                      }}
                    >
                      <Avatar src={item.avatar_url || undefined} name={item.name} size={46} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: colors.title, fontSize: 15, fontWeight: 700 }}>{item.name}</div>
                        <div style={{ marginTop: 6 }}>
                          <span style={chipStyle("#eef2ff", colors.primaryDeep, 500)}>{item.department || "未设置部门"}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: colors.title }}>
                          {fmtPoints(item.total_points)}
                        </div>
                        <div style={{ color: colors.muted, fontSize: 12 }}>总分</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!listLoading && items.length === 0 ? <SectionEmpty description="暂无积分排行榜数据" /> : null}
        </Card>
      </div>
    </PageShell>
  );
};

export default LeaderboardPage;
