import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, Card, Toast } from "antd-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import { receiveProjectMember } from "../api/projects";
import { receiveTask } from "../api/tasks";
import { PageShell, SectionLoading, colors, sectionCardStyle } from "../components/ui";

const safeRedirectPath = (value: string | null, fallback: string) => {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback;
  return value;
};

const NotificationReceiptPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kind = params.get("kind");
  const id = params.get("id") || "";
  const fallbackPath = kind === "task" ? "/board" : id ? `/projects/${id}` : "/projects";
  const targetPath = safeRedirectPath(params.get("redirect"), fallbackPath);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        if (kind === "task") {
          await receiveTask(id);
        } else if (kind === "project") {
          await receiveProjectMember(id);
        } else {
          throw new Error("unknown receipt kind");
        }
        if (!active) return;
        setSuccess(true);
        Toast.show({ icon: "success", content: "已确认收到" });
      } catch {
        if (!active) return;
        setSuccess(false);
        Toast.show({ icon: "fail", content: "确认失败，请重新登录后再试" });
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [id, kind]);

  if (loading) {
    return (
      <PageShell>
        <SectionLoading text="正在确认收到..." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card style={sectionCardStyle}>
        <div style={{ color: colors.title, fontSize: 20, fontWeight: 800 }}>
          {success ? "已确认收到" : "确认失败"}
        </div>
        <div style={{ marginTop: 10, color: colors.muted, fontSize: 13, lineHeight: 1.7 }}>
          {success ? "系统已记录你的确认状态。" : "请确认当前飞书账号已登录应用后重试。"}
        </div>
        <Button
          color="primary"
          block
          style={{ marginTop: 18, "--border-radius": "12px" } as CSSProperties}
          onClick={() => navigate(targetPath)}
        >
          {success ? "查看详情" : "返回"}
        </Button>
      </Card>
    </PageShell>
  );
};

export default NotificationReceiptPage;
