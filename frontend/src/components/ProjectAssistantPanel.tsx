import { useState } from "react";
import { Button, TextArea, Toast } from "antd-mobile";
import { queryProjectAssistant, type ProjectAssistantResponse } from "../api/assistant";
import { useAuth } from "../hooks/useAuth";

type ChatMessage = { role: "user" | "assistant"; content: string };

const style = `
  .project-assistant { position: fixed; right: 18px; bottom: 28px; z-index: 1198; font-family: Inter, Arial, "PingFang SC", sans-serif; }
  .project-assistant-button { min-width: 94px; height: 44px; padding: 0 16px; border: 0; border-radius: 999px; background: linear-gradient(135deg,#3370ff,#14b8a6); color: #fff; font-size: 13px; font-weight: 800; box-shadow: 0 14px 32px rgba(51,112,255,.28); cursor: pointer; }
  .project-assistant-panel { position: absolute; right: 0; bottom: 56px; display: flex; flex-direction: column; width: min(500px,calc(100vw - 24px)); height: min(720px,calc(100vh - 100px)); overflow: hidden; border: 1px solid #dfe5ef; border-radius: 20px; background: #fff; box-shadow: 0 26px 70px rgba(31,35,41,.22); }
  .project-assistant-head { display:flex; align-items:center; justify-content:space-between; padding: 16px 18px 12px; border-bottom: 1px solid #edf0f5; color:#1f2329; }
  .project-assistant-brand { display:flex; align-items:center; gap:10px; }
  .project-assistant-avatar { width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; border-radius:10px; background:linear-gradient(135deg,#3370ff,#14b8a6); color:#fff; font-size:14px; font-weight:900; }
  .project-assistant-title { font-size:15px; font-weight:800; }
  .project-assistant-subtitle { margin-top:2px; color:#8f959e; font-size:11px; }
  .project-assistant-close { width:28px; height:28px; border:0; border-radius:8px; background:#f5f7fa; color:#646a73; font-size:20px; cursor:pointer; }
  .project-assistant-chat { flex:1; overflow:auto; padding:14px 16px; background:linear-gradient(180deg,#fbfcfe,#f7f9fc); }
  .project-assistant-welcome { padding:18px; border:1px solid #e5ebf5; border-radius:14px; background:#fff; color:#646a73; font-size:13px; line-height:1.65; }
  .project-assistant-welcome b { display:block; margin-bottom:5px; color:#1f2329; font-size:15px; }
  .project-assistant-message { display:flex; margin:0 0 12px; }
  .project-assistant-message[data-role="user"] { justify-content:flex-end; }
  .project-assistant-bubble { max-width:88%; padding:10px 12px; border-radius:14px; color:#1f2329; font-size:13px; line-height:1.65; white-space:pre-wrap; }
  .project-assistant-message[data-role="user"] .project-assistant-bubble { border-bottom-right-radius:4px; background:#3370ff; color:#fff; }
  .project-assistant-message[data-role="assistant"] .project-assistant-bubble { border:1px solid #e5ebf5; border-bottom-left-radius:4px; background:#fff; }
  .project-assistant-thinking { color:#646a73; font-size:12px; }
  .project-assistant-thinking span { display:inline-block; margin-right:6px; animation: assistant-pulse 1.2s infinite ease-in-out; }
  @keyframes assistant-pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
  .project-assistant-quick { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 0; }
  .project-assistant-quick button { padding:6px 9px; border:1px solid #dce5f4; border-radius:999px; background:#fff; color:#3370ff; font-size:11px; cursor:pointer; }
  .project-assistant-meta { margin:0 0 10px; padding:9px 10px; border-radius:10px; background:#eef6ff; color:#1d4ed8; font-size:11px; line-height:1.6; }
  .project-assistant-meta[data-mode="fallback"] { background:#fff7e6; color:#b45309; }
  .project-assistant-meta[data-mode="none"] { background:#fff1f2; color:#be123c; }
  .project-assistant-evidence { margin-top:8px; border:1px solid #e5ebf5; border-radius:10px; background:#fff; }
  .project-assistant-evidence summary { padding:9px 10px; color:#646a73; font-size:11px; cursor:pointer; }
  .project-assistant-source { margin:0 10px 8px; padding:8px; border-left:3px solid #bacefd; background:#f7f9fc; color:#646a73; font-size:11px; line-height:1.55; }
  .project-assistant-source b { color:#1f2329; }
  .project-assistant-composer { padding:10px 12px 12px; border-top:1px solid #edf0f5; background:#fff; }
  .project-assistant-hint { margin:0 0 8px; color:#8f959e; font-size:11px; }
  .project-assistant-actions { display:flex; gap:8px; margin-top:8px; }
`;

const quickQuestions = ["具身 BU 有什么项目？", "这些项目最新进展是什么？", "哪些项目有逾期或卡点？"];

const ProjectAssistantPanel = () => {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [result, setResult] = useState<ProjectAssistantResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  if (!me) return null;
  const ask = async () => {
    const value = question.trim();
    if (!value || loading) return;
    setLoading(true);
    setLoadingStage("正在检索项目、任务和进展资料…");
    setQuestion("");
    const timer = window.setTimeout(() => setLoadingStage("正在调用大模型分析证据并组织回答…"), 500);
    setMessages((items) => [...items, { role: "user", content: value }]);
    try {
      const next = await queryProjectAssistant(value, {
        projectIds: result?.projects.map((project) => project.project_id),
        conversation: messages.slice(-6),
      });
      setResult(next);
      setMessages((items) => [...items, { role: "assistant", content: next.answer }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", content: error instanceof Error ? error.message : "查询失败，请稍后重试。" }]);
      Toast.show({ icon: "fail", content: "助手暂时无法回答" });
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
      setLoadingStage("");
    }
  };

  return <>
    <style>{style}</style>
    <div className="project-assistant">
      {open ? <div className="project-assistant-panel">
        <div className="project-assistant-head">
          <div className="project-assistant-brand"><span className="project-assistant-avatar">卷</span><div><div className="project-assistant-title">助手小卷</div><div className="project-assistant-subtitle">项目知识库 · 证据增强回答</div></div></div>
          <button className="project-assistant-close" type="button" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="project-assistant-chat">
          {!messages.length ? <div className="project-assistant-welcome"><b>你好，我是助手小卷</b>我会先检索项目资料，再基于证据回答。你可以问项目范围、最新进展、风险、负责人、任务或审批状态。<div className="project-assistant-quick">{quickQuestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)}>{item}</button>)}</div></div> : null}
          {messages.map((message, index) => <div className="project-assistant-message" data-role={message.role} key={`${message.role}-${index}`}><div className="project-assistant-bubble">{message.content}</div></div>)}
          {loading ? <div className="project-assistant-message" data-role="assistant"><div className="project-assistant-bubble project-assistant-thinking"><span>●</span>{loadingStage}</div></div> : null}
          {result ? <>
            <div className="project-assistant-meta" data-mode={result.answer_mode === "database_fallback" ? "fallback" : result.answer_mode === "no_match" ? "none" : "llm"}>{result.answer_mode === "llm" ? `已调用 ${result.model_name || "大模型"} · ${result.sources.length} 条证据` : result.answer_mode === "database_fallback" ? `大模型未返回有效答案，已明确降级为数据库事实 · ${result.llm_error || "请稍后重试"}` : "没有足够的匹配证据"}<br />{result.steps.join(" · ")} · 数据截至 {result.generated_at.slice(0, 16).replace("T", " ")} · trace {result.trace_id}</div>
            <details className="project-assistant-evidence"><summary>查看回答依据（{result.sources.length} 条）</summary>{result.sources.slice(0, 8).map((source) => <div className="project-assistant-source" key={source.source_id}><b>[{source.source_id}] {source.title}</b><br />{source.content}</div>)}</details>
          </> : null}
        </div>
        <div className="project-assistant-composer"><div className="project-assistant-hint">支持连续追问；回答会标明模型状态和证据来源。</div><TextArea value={question} onChange={setQuestion} onEnterPress={(event) => { if (event.shiftKey) return; event.preventDefault(); void ask(); }} placeholder="输入问题，例如：这些项目哪个最危险？" autoSize={{ minRows: 2, maxRows: 4 }} /><div className="project-assistant-actions"><Button color="primary" loading={loading} onClick={() => void ask()}>发送</Button><Button fill="outline" onClick={() => { setQuestion(""); setResult(null); setMessages([]); }}>新对话</Button></div></div>
      </div> : null}
      <button className="project-assistant-button" type="button" onClick={() => setOpen((value) => !value)}>助手小卷</button>
    </div>
  </>;
};

export default ProjectAssistantPanel;
