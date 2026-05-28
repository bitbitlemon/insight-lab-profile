import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Card, Tabs } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { listAClassAchievements, type AClassAchievementRead } from "../api/aClassAchievements";
import { PageShell, SectionEmpty, SectionError, SectionLoading, chipStyle, colors, lineClamp, listItemCardStyle, sectionCardStyle } from "../components/ui";

const attachmentBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: colors.muted,
  fontSize: 12,
  fontWeight: 600,
};

const formatMetaLine = (item: AClassAchievementRead): string => {
  return [item.event_date, item.responsible_person, item.first_student].filter(Boolean).join(" · ");
};

const AchievementsPage = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<AClassAchievementRead[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    listAClassAchievements(activeCategory === "all" ? undefined : { research_category: activeCategory })
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setTotal(response.total);
        setCategories(response.research_categories || []);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeCategory]);

  const tabItems = useMemo(
    () => [{ key: "all", title: "全部" }].concat(categories.map((category) => ({ key: category, title: category }))),
    [categories],
  );

  const renderContent = () => {
    if (loading) {
      return <SectionLoading text="正在加载 A 类成果..." />;
    }
    if (error) {
      return <SectionError title="A 类成果加载失败" description="请稍后重试，或切换分类后重新进入。" />;
    }
    if (!items.length) {
      return <SectionEmpty description="当前分类下暂无成果记录" />;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => {
          const pdfCount = item.pdf_files?.length || 0;
          const imageCount = item.image_files?.length || 0;
          const metaLine = formatMetaLine(item);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/achievements/${item.id}`)}
              style={{
                ...listItemCardStyle,
                width: "100%",
                padding: "14px 15px",
                textAlign: "left",
                cursor: "pointer",
                appearance: "none",
              }}
            >
              <div style={{ color: colors.title, fontSize: 18, fontWeight: 800, lineHeight: 1.4 }}>
                {item.event_name || "未命名成果"}
              </div>
              {item.project_content ? (
                <div
                  style={{
                    ...lineClamp(2),
                    marginTop: 8,
                    color: colors.body,
                    fontSize: 13,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {item.project_content}
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {item.level ? <span style={chipStyle("#dbeafe", "#1d4ed8", 700)}>{item.level}</span> : null}
                {item.award_grade ? <span style={chipStyle("#ffedd5", "#c2410c", 700)}>{item.award_grade}</span> : null}
                {item.research_category ? <span style={chipStyle("#dcfce7", "#15803d", 700)}>{item.research_category}</span> : null}
                {item.department ? <span style={chipStyle("#f3f4f6", "#4b5563", 600)}>{item.department}</span> : null}
              </div>
              {metaLine ? (
                <div style={{ marginTop: 10, color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>
                  {metaLine}
                </div>
              ) : null}
              {pdfCount > 0 || imageCount > 0 ? (
                <div style={{ marginTop: 10, ...attachmentBadgeStyle }}>
                  {pdfCount > 0 ? <span>📄 {pdfCount}</span> : null}
                  {imageCount > 0 ? <span>🖼 {imageCount}</span> : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ color: colors.title, fontSize: 20, fontWeight: 800 }}>A 类成果</div>
                <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>按研究方向归档成果，支持图片与 PDF 材料查看</div>
              </div>
              <span style={chipStyle(colors.primarySoft, colors.primaryDeep, 700)}>共 {total} 条</span>
            </div>

            <Tabs activeKey={activeCategory} onChange={setActiveCategory}>
              {tabItems.map((tab) => (
                <Tabs.Tab key={tab.key} title={tab.title} />
              ))}
            </Tabs>

            {renderContent()}
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

export default AchievementsPage;
