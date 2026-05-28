import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button, Card, Space, Toast } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { PageShell, SectionError, SectionLoading, colors, sectionCardStyle } from "../components/ui";
import { larkLogin } from "../hooks/useAuth";
import { getLarkCode, isInLark, larkEnvInfo, waitForLarkReady } from "../utils/lark";

type Stage = "checking" | "requesting_code" | "exchanging" | "ok" | "error";

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "unknown error";
  }
};

const LoginPage = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const appId = import.meta.env.VITE_LARK_APP_ID as string | undefined;

  const run = useCallback(async () => {
    setErrMsg(null);
    if (!appId) {
      setStage("error");
      setErrMsg("missing VITE_LARK_APP_ID");
      return;
    }
    await waitForLarkReady();
    if (!isInLark()) {
      setStage("error");
      setErrMsg("not_in_lark");
      return;
    }
    try {
      setStage("requesting_code");
      const code = await getLarkCode(appId);
      setStage("exchanging");
      await larkLogin(code);
      setStage("ok");
      navigate("/", { replace: true });
    } catch (err) {
      setStage("error");
      setErrMsg(extractMessage(err));
    }
  }, [appId, navigate]);

  const loadDiag = useCallback(async () => {
    try {
      const base = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
      const response = await axios.get(`${base}/auth/diagnose`);
      setDiag(response.data);
    } catch (err) {
      Toast.show({ content: "诊断接口不可达: " + extractMessage(err) });
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  if (stage !== "error") {
    const messages: Record<Exclude<Stage, "error">, string> = {
      checking: "正在检查飞书运行环境",
      requesting_code: "正在向飞书申请访问授权",
      exchanging: "正在登录实验室档案系统",
      ok: "登录成功，正在跳转",
    };

    return (
      <PageShell>
        <div style={{ minHeight: "78vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Card
            style={{
              ...sectionCardStyle,
              width: "100%",
              maxWidth: 440,
              background: "linear-gradient(180deg, #ffffff 0%, #f7f8ff 100%)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                padding: "20px 4px 8px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 20,
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  boxShadow: "0 16px 30px rgba(99,102,241,0.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: 26,
                  fontWeight: 800,
                }}
              >
                档
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: colors.title }}>飞书登录</div>
                <div style={{ marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>
                  实验室档案系统将使用飞书身份完成认证
                </div>
              </div>
              <SectionLoading text={messages[stage]} />
            </div>
          </Card>
        </div>
      </PageShell>
    );
  }

  const isNotInLark = errMsg === "not_in_lark";
  const env = larkEnvInfo();
  const envHint = env.uaHintsLark && !env.hasTt
    ? "已在飞书 WebView，但 tt JSAPI 未注入，通常是 H5 入口未正确发布，或不是从飞书工作台进入。"
    : env.uaHintsLark && env.hasTt && !env.hasRequestAccess
      ? "tt 已注入，但 requestAccess 不可用，可能是飞书版本过旧或 SDK 初始化失败。"
      : !env.uaHintsLark
        ? "当前 User-Agent 不像飞书客户端，你可能是在普通浏览器中打开。"
        : null;

  return (
    <PageShell>
      <div style={{ minHeight: "78vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 14 }}>
          <SectionError
            title={isNotInLark ? "请在飞书 App 内打开" : "飞书登录失败"}
            description={isNotInLark ? "当前环境无法调用 tt.requestAccess" : errMsg ?? "未知错误"}
            action={
              <Space direction="vertical" block>
                {!isNotInLark ? (
                  <Button
                    color="primary"
                    block
                    onClick={run}
                    style={{ "--border-radius": "12px", "--background-color": colors.primary } as CSSProperties}
                  >
                    重试登录
                  </Button>
                ) : null}
                <Button
                  block
                  onClick={loadDiag}
                  style={
                    {
                      "--border-radius": "12px",
                      "--border-color": "rgba(99,102,241,0.2)",
                      "--text-color": colors.primaryDeep,
                    } as CSSProperties
                  }
                >
                  查看后端诊断
                </Button>
              </Space>
            }
          />

          {diag ? (
            <Card style={sectionCardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.title }}>后端诊断</div>
              <pre
                style={{
                  margin: "10px 0 0",
                  fontSize: 12,
                  padding: 12,
                  background: "#f8fafc",
                  color: "#0f172a",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(diag, null, 2)}
              </pre>
            </Card>
          ) : null}

          <Card style={sectionCardStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {envHint ? <div style={{ fontSize: 12, color: "#b91c1c", lineHeight: 1.6 }}>{envHint}</div> : null}
              <details style={{ fontSize: 12, color: colors.muted }}>
                <summary style={{ cursor: "pointer", color: colors.body }}>前端环境信息</summary>
                <pre
                  style={{
                    margin: "10px 0 0",
                    fontSize: 11,
                    padding: 12,
                    background: "#f8fafc",
                    color: "#0f172a",
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(env, null, 2)}
                </pre>
              </details>
              <div style={{ fontSize: 12, color: colors.placeholder }}>VITE_LARK_APP_ID: {appId || "(未配置)"}</div>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
};

export default LoginPage;
