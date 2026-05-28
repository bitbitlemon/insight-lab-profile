import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Card, ImageViewer, Tabs } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { galleryPhotoUrl, listGalleryPhotos, type GalleryPhoto } from "../api/gallery";
import { PageShell, SectionEmpty, SectionError, SectionLoading, chipStyle, colors, lineClamp, sectionCardStyle } from "../components/ui";

type GalleryTabKey = "all" | "competition" | "paper";

const tabItems: Array<{ key: GalleryTabKey; title: string }> = [
  { key: "all", title: "全部" },
  { key: "competition", title: "比赛" },
  { key: "paper", title: "论文" },
];

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
};

const imageButtonStyle: CSSProperties = {
  position: "relative",
  padding: 0,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  overflow: "hidden",
  background: "#ffffff",
  aspectRatio: "1 / 1",
  width: "100%",
  cursor: "pointer",
};

const iconButtonStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "rgba(17,24,39,0.68)",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const SourceJumpIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14 19 5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GalleryPage = () => {
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState<GalleryTabKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [total, setTotal] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [brokenTokens, setBrokenTokens] = useState<Record<string, true>>({});

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(false);

    listGalleryPhotos(activeKey)
      .then((response) => {
        if (canceled) return;
        setPhotos(response.items);
        setTotal(response.total);
      })
      .catch(() => {
        if (canceled) return;
        setError(true);
        setPhotos([]);
        setTotal(0);
      })
      .finally(() => {
        if (canceled) return;
        setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [activeKey]);

  const photoItems = useMemo(
    () =>
      photos.map((photo) => ({
        photo,
        href: galleryPhotoUrl(photo),
      })),
    [photos],
  );

  const viewerImages = useMemo(
    () => photoItems.filter((item) => !brokenTokens[item.photo.file_token]).map((item) => item.href),
    [brokenTokens, photoItems],
  );

  const openViewer = (fileToken: string) => {
    const nextIndex = viewerImages.findIndex((href) => href.includes(encodeURIComponent(fileToken)));
    if (nextIndex < 0) return;
    setViewerIndex(nextIndex);
    setViewerVisible(true);
  };

  const handleJump = (photo: GalleryPhoto) => {
    if (photo.source_type === "competition") {
      navigate(`/competitions/${photo.source_id}`);
      return;
    }
    navigate(`/papers/${photo.source_id}/pipeline`);
  };

  const renderContent = () => {
    if (loading) {
      return <SectionLoading text="正在加载相册..." />;
    }

    if (error) {
      return <SectionError title="相册加载失败" description="请稍后重试，或切换分类后重新进入。" />;
    }

    if (!photos.length) {
      return <SectionEmpty description={activeKey === "paper" ? "暂无论文图片素材" : "暂无图片素材"} />;
    }

    return (
      <div style={gridStyle}>
        {photoItems.map(({ photo, href }, index) => {
          const isBroken = Boolean(brokenTokens[photo.file_token]);
          return (
            <div key={`${photo.file_token}-${index}`} style={{ minWidth: 0 }}>
              <div
                role="button"
                tabIndex={isBroken ? -1 : 0}
                onClick={() => openViewer(photo.file_token)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openViewer(photo.file_token);
                  }
                }}
                style={{ ...imageButtonStyle, cursor: isBroken ? "default" : "pointer" }}
              >
                {!isBroken ? (
                  <img
                    src={href}
                    alt={photo.name || photo.source_title}
                    loading="lazy"
                    decoding="async"
                    onError={() => setBrokenTokens((current) => ({ ...current, [photo.file_token]: true }))}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "linear-gradient(180deg, #f8fafc, #eef2ff)" }} />
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleJump(photo);
                  }}
                  style={iconButtonStyle}
                  aria-label="跳转来源详情"
                >
                  <SourceJumpIcon />
                </button>
              </div>
              <div
                style={{
                  ...lineClamp(2),
                  marginTop: 6,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: colors.body,
                  wordBreak: "break-word",
                }}
              >
                [{photo.source_subtype}]{photo.source_title}
              </div>
            </div>
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
                <div style={{ color: colors.title, fontSize: 20, fontWeight: 800 }}>相册</div>
                <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>按来源统一归档图片素材，点图预览，点角标跳转来源详情</div>
              </div>
              <span style={chipStyle(colors.primarySoft, colors.primaryDeep, 700)}>
                共 {total} 张
              </span>
            </div>

            <Tabs activeKey={activeKey} onChange={(key) => setActiveKey(key as GalleryTabKey)}>
              {tabItems.map((tab) => (
                <Tabs.Tab key={tab.key} title={tab.title} />
              ))}
            </Tabs>

            {renderContent()}
          </div>
        </Card>
      </div>

      <ImageViewer.Multi
        images={viewerImages}
        visible={viewerVisible}
        defaultIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </PageShell>
  );
};

export default GalleryPage;
