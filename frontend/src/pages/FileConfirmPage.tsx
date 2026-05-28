import type { CSSProperties } from "react";
import { Button, Card } from "antd-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageShell, colors, sectionCardStyle } from "../components/ui";

const FileConfirmPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const href = params.get("href") || "";
  const name = params.get("name") || "未命名文件";
  const mode = params.get("mode") === "open" ? "open" : "download";

  const handleContinue = () => {
    if (!href) return;
    window.location.href = href;
  };

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 20 }}>
        <Button
          fill="none"
          style={{ alignSelf: "flex-start", padding: 0, "--text-color": colors.primaryDeep } as CSSProperties}
          onClick={() => navigate(-1)}
        >
          {"< 返回"}
        </Button>
        <Card style={sectionCardStyle}>
          <div style={{ color: colors.title, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>确认{mode === "open" ? "打开" : "下载"}文件</div>
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: `1px solid ${colors.border}` }}>
            <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>文件名</div>
            <div style={{ color: colors.body, fontSize: 14, fontWeight: 700, lineHeight: 1.5, wordBreak: "break-all" }}>{name}</div>
          </div>
          <div style={{ marginTop: 12, color: colors.muted, fontSize: 13, lineHeight: 1.7 }}>
            文件将通过系统代理从飞书附件临时链接获取。请确认来源可信后继续。
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <Button block fill="outline" onClick={() => navigate(-1)}>取消</Button>
            <Button block color="primary" disabled={!href} onClick={handleContinue}>
              确认{mode === "open" ? "打开" : "下载"}
            </Button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

export default FileConfirmPage;
