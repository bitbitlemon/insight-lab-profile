import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Toast } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPaper,
  getZhangqianLog,
  type ZhangqianLogGroupSummary,
  type ZhangqianLogResponse,
  type ZhangqianLogStage,
  type ZhangqianStageGroup,
} from "../api/papers";
import { PageShell, chipStyle, colors, sectionCardStyle } from "../components/ui";
import { fileConfirmUrl } from "../utils/fileLinks";
import type { Paper } from "../types/api";

const formatBytes = (n?: number): string => {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
};

type FileKind = "image" | "pdf" | "word" | "excel" | "ppt" | "zip" | "code" | "text" | "video" | "audio" | "doc" | "other";

const EXT_KIND: Record<string, FileKind> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", bmp: "image", svg: "image", heic: "image",
  pdf: "pdf",
  doc: "word", docx: "word",
  xls: "excel", xlsx: "excel", csv: "excel",
  ppt: "ppt", pptx: "ppt", key: "ppt",
  zip: "zip", rar: "zip", "7z": "zip", tar: "zip", gz: "zip", bz2: "zip",
  py: "code", js: "code", ts: "code", tsx: "code", jsx: "code", cpp: "code", c: "code", h: "code", hpp: "code", java: "code", go: "code", rs: "code", rb: "code", php: "code", sh: "code", sql: "code",
  md: "text", txt: "text", json: "text", yml: "text", yaml: "text", xml: "text", html: "text", log: "text", bib: "text", tex: "text",
  mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video",
  mp3: "audio", wav: "audio", flac: "audio", m4a: "audio",
};

const KIND_STYLE: Record<FileKind, { bg: string; fg: string; label: string }> = {
  image: { bg: "#fce7f3", fg: "#9d174d", label: "IMG" },
  pdf: { bg: "#fee2e2", fg: "#991b1b", label: "PDF" },
  word: { bg: "#dbeafe", fg: "#1e40af", label: "DOC" },
  excel: { bg: "#dcfce7", fg: "#15803d", label: "XLS" },
  ppt: { bg: "#ffedd5", fg: "#9a3412", label: "PPT" },
  zip: { bg: "#ede9fe", fg: "#5b21b6", label: "ZIP" },
  code: { bg: "#cffafe", fg: "#0e7490", label: "</>" },
  text: { bg: "#f3f4f6", fg: "#4b5563", label: "TXT" },
  video: { bg: "#fef3c7", fg: "#92400e", label: "VID" },
  audio: { bg: "#fef3c7", fg: "#92400e", label: "AUD" },
  doc: { bg: "#eef2ff", fg: "#4338ca", label: "DOC" },
  other: { bg: "#e5e7eb", fg: "#4b5563", label: "FILE" },
};

const getFileKind = (name?: string): FileKind => {
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  return EXT_KIND[ext] || "other";
};

const FileTypeIcon = ({ kind, size = 32 }: { kind: FileKind; size?: number }) => {
  const s = KIND_STYLE[kind];
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: s.bg,
        color: s.fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size <= 24 ? 10 : 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
};

const proxyUrl = (fileToken?: string): string => {
  if (!fileToken) return "";
  const jwt = localStorage.getItem("jwt") || "";
  return `/api/papers/files/${encodeURIComponent(fileToken)}/proxy?token=${encodeURIComponent(jwt)}`;
};

const GROUP_ORDER: ZhangqianStageGroup[] = ["S", "REVISION", "ACC", "ONLINE"];

const GROUP_META: Record<ZhangqianStageGroup, { short: string; title: string; desc: string }> = {
  S: { short: "主流程", title: "主流程材料", desc: "基线、创新、开题、初稿、内部返修、投稿包等主流程必交材料。" },
  REVISION: { short: "返修", title: "返修材料", desc: "外审意见返回后，需补齐返修阶段的过程材料。" },
  ACC: { short: "接收后", title: "接收后材料", desc: "论文接收后需补齐接收确认、终稿整理等材料。" },
  ONLINE: { short: "上线前", title: "上线前材料", desc: "正式上线前需补齐 DOI、开源与最终发布相关材料。" },
};

const linkButtonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  background: colors.primarySoft,
  color: colors.primaryDeep,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
};

const getStageEmptyText = (kind: ZhangqianLogStage["kind"]): string => {
  if (kind === "doc") return "尚未上传云文档链接";
  if (kind === "attachment") return "尚未上传附件";
  return "尚未填写";
};

const getGroupTone = (missing: number) => {
  if (missing > 0) {
    return {
      chipBg: "#fee2e2",
      chipFg: "#991b1b",
      border: "#fca5a5",
      panel: "#fff7f7",
      summary: "#b91c1c",
    };
  }
  return {
    chipBg: "#dcfce7",
    chipFg: "#15803d",
    border: "#bbf7d0",
    panel: "#f7fff9",
    summary: "#15803d",
  };
};

const GroupChip = ({ group }: { group: ZhangqianLogGroupSummary }) => {
  const meta = GROUP_META[group.key];
  const tone = getGroupTone(group.missing);
  return (
    <span
      style={{
        ...chipStyle(tone.chipBg, tone.chipFg, 700),
        fontSize: 12,
        padding: "6px 10px",
      }}
    >
      {meta.short} {group.filled}/{group.total}
    </span>
  );
};

const StageCard = ({ stage }: { stage: ZhangqianLogStage }) => {
  const missing = stage.missing || (stage.required && !stage.has_content);
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 12,
        border: `1px solid ${missing ? "#fca5a5" : colors.border}`,
        background: missing ? "#fef2f2" : colors.panel,
        boxShadow: missing ? "0 8px 20px rgba(239, 68, 68, 0.08)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={chipStyle("#eef2ff", "#4338ca", 700)}>{stage.key}</span>
            <span style={{ color: colors.title, fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{stage.label}</span>
          </div>
        </div>
        <span style={chipStyle(missing ? "#fee2e2" : "#dcfce7", missing ? "#b91c1c" : "#15803d", 700)}>
          {missing ? "缺失 · 待补充" : "已交"}
        </span>
      </div>

      {stage.kind === "doc" && stage.has_content ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(stage.links || []).map((link, index) => (
            <a
              key={`${stage.key}-link-${index}`}
              href={link.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: "#ffffff",
                color: link.url ? colors.primaryDeep : colors.muted,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                border: `1px solid ${colors.border}`,
                wordBreak: "break-all",
              }}
            >
              <FileTypeIcon kind="doc" size={32} />
              <span style={{ flex: 1, minWidth: 0 }}>{link.text || link.url || "云文档链接"}</span>
              {link.url ? <span style={{ fontSize: 12, color: colors.muted }}>查看</span> : null}
            </a>
          ))}
        </div>
      ) : null}

      {stage.kind === "attachment" && stage.has_content ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(stage.files || []).map((file, index) => {
            const kind = getFileKind(file.name);
            const href = proxyUrl(file.file_token);
            const isPdf = kind === "pdf";
            return (
              <div
                key={`${stage.key}-file-${index}`}
                style={{
                  display: "flex",
                  flexDirection: isPdf ? "column" : "row",
                  alignItems: isPdf ? "stretch" : "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#ffffff",
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                  {kind === "image" && href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: "#ffffff",
                        border: `1px solid ${colors.border}`,
                        overflow: "hidden",
                        flexShrink: 0,
                        display: "block",
                      }}
                    >
                      <img
                        src={href}
                        alt={file.name || ""}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </a>
                  ) : (
                    <FileTypeIcon kind={kind} size={40} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: colors.body, fontSize: 13, fontWeight: 600, lineHeight: 1.4, wordBreak: "break-all" }}>
                      {file.name || "未命名附件"}
                    </div>
                    {file.size ? <div style={{ marginTop: 2, fontSize: 11, color: colors.muted }}>{formatBytes(file.size)}</div> : null}
                  </div>
                  {href ? (
                    <a
                      href={fileConfirmUrl(href, file.name, kind === "image" ? "open" : "download")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: colors.primarySoft,
                        color: colors.primaryDeep,
                        fontSize: 12,
                        fontWeight: 700,
                        textDecoration: "none",
                        flexShrink: 0,
                      }}
                    >
                      {kind === "image" ? "查看" : "下载"}
                    </a>
                  ) : null}
                </div>
                {isPdf && href ? (
                  <iframe
                    src={href}
                    title={file.name || "PDF 附件预览"}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: 480,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 10,
                      background: "#fff",
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {stage.kind === "text" && stage.has_content ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "#ffffff",
            color: colors.body,
            fontSize: 13,
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            border: `1px solid ${colors.border}`,
          }}
        >
          {stage.text}
        </div>
      ) : null}

      {!stage.has_content ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px dashed ${missing ? "#fca5a5" : colors.border}`,
            background: missing ? "#fff7f7" : "#f9fafb",
            color: missing ? "#b91c1c" : colors.muted,
            fontSize: 13,
            lineHeight: 1.6,
            fontWeight: 600,
          }}
        >
          {getStageEmptyText(stage.kind)}
        </div>
      ) : null}
    </div>
  );
};

const PaperPipelinePage = () => {
  const navigate = useNavigate();
  const { paper_id } = useParams();
  const paperId = Number(paper_id);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [log, setLog] = useState<ZhangqianLogResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!paperId) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const [nextPaper, nextLog] = await Promise.all([getPaper(paperId), getZhangqianLog(paperId)]);
        if (!active) return;
        setPaper(nextPaper);
        setLog(nextLog);
      } catch {
        if (active) Toast.show({ content: "加载失败" });
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [paperId]);

  const summary = log?.summary;
  const stages = log?.stages || [];
  const requiredCount = summary?.required_count ?? stages.filter((stage) => stage.required).length;
  const filledCount = summary?.filled_count ?? stages.filter((stage) => stage.has_content).length;
  const missingCount = summary?.missing_count ?? stages.filter((stage) => stage.missing).length;
  const progress = requiredCount > 0 ? Math.min(100, (filledCount / requiredCount) * 100) : 0;

  const groupedStages = useMemo(() => {
    return GROUP_ORDER
      .map((groupKey) => {
        const summaryGroup = summary?.groups.find((item) => item.key === groupKey);
        const groupStages = stages.filter((stage) => stage.group === groupKey);
        const fallbackGroup: ZhangqianLogGroupSummary = {
          key: groupKey,
          label: GROUP_META[groupKey].title,
          desc: GROUP_META[groupKey].desc,
          total: groupStages.length,
          filled: groupStages.filter((stage) => stage.has_content).length,
          missing: groupStages.filter((stage) => stage.missing).length,
        };
        return {
          summary: summaryGroup ?? fallbackGroup,
          stages: groupStages,
        };
      })
      .filter((group) => group.summary.total > 0 || group.stages.length > 0);
  }, [stages, summary]);

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.title, lineHeight: 1.2 }}>论文过程材料</div>
            {paper ? (
              <div style={{ marginTop: 4, fontSize: 12, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                《{paper.title}》
              </div>
            ) : null}
          </div>
          <Button size="mini" fill="outline" onClick={() => navigate(-1)}>
            返回
          </Button>
        </div>

        {loading ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.muted, fontSize: 12, textAlign: "center", padding: "14px 0" }}>正在加载过程材料...</div>
          </Card>
        ) : !log?.matched ? (
          <Card style={sectionCardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.title, marginBottom: 6 }}>未在张迁组日志库找到对应记录</div>
            <div style={{ color: colors.muted, fontSize: 12, lineHeight: 1.7 }}>
              已扫描 {log?.total_records ?? 0} 条记录，未匹配到《{log?.tried_title_en || paper?.title || "—"}》。
              <br />
              如已在张迁组日志库录入，请确认英文标题完全一致。
            </div>
          </Card>
        ) : (
          <>
            <Card style={sectionCardStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {log.current_status ? <span style={chipStyle("#eef2ff", "#4338ca", 700)}>状态 · {log.current_status}</span> : null}
                  {log.submit_journal ? <span style={chipStyle("#dbeafe", "#1e40af", 700)}>{log.submit_journal}</span> : null}
                  {log.submit_date ? <span style={chipStyle("#f3f4f6", "#4b5563", 600)}>投稿日期 {String(log.submit_date).slice(0, 10)}</span> : null}
                  {log.publish_date ? <span style={chipStyle("#f3f4f6", "#4b5563", 600)}>发表日期 {String(log.publish_date).slice(0, 10)}</span> : null}
                </div>

                <div style={{ fontSize: 20, fontWeight: 800, color: colors.title, lineHeight: 1.35 }}>
                  {log.title_zh || paper?.title || "未命名论文"}
                </div>

                {(log.participants && log.participants.length > 0) || (log.advisor && log.advisor.length > 0) ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {log.participants && log.participants.length > 0 ? (
                      <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.6 }}>
                        主要参与人：{log.participants.map((item) => item.name).join("、")}
                      </div>
                    ) : null}
                    {log.advisor && log.advisor.length > 0 ? (
                      <div style={{ color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>
                        指导：{log.advisor.map((item) => item.name).join("、")}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {log.doi || log.opensource_url ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {log.doi ? (
                      <a
                        href={log.doi.startsWith("http") ? log.doi : `https://doi.org/${log.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={linkButtonStyle}
                      >
                        DOI
                      </a>
                    ) : null}
                    {log.opensource_url ? (
                      <a href={log.opensource_url} target="_blank" rel="noopener noreferrer" style={linkButtonStyle}>
                        开源链接
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card style={sectionCardStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.title, marginBottom: 8 }}>完成度总览</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: colors.title, lineHeight: 1.15 }}>
                    已交 {filledCount} / 共 {requiredCount} · 还缺 {missingCount} 项
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: missingCount > 0 ? "#b91c1c" : "#15803d", fontWeight: 700 }}>
                    {missingCount > 0 ? "过程材料未齐，缺失项需尽快补充。" : "全部过程材料已齐全。"}
                  </div>
                </div>

                <div style={{ height: 10, borderRadius: 999, background: "#e0e7ff", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: missingCount > 0 ? colors.primary : "#16a34a",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(summary?.groups || []).map((group) => (
                    <GroupChip key={group.key} group={group} />
                  ))}
                </div>
              </div>
            </Card>

            {log.log_text ? (
              <Card style={sectionCardStyle}>
                <details>
                  <summary style={{ cursor: "pointer", color: colors.title, fontSize: 14, fontWeight: 700, listStyle: "none" }}>
                    完整日志
                  </summary>
                  <div
                    style={{
                      marginTop: 12,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "#f8fafc",
                      color: colors.body,
                      fontSize: 13,
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    {log.log_text}
                  </div>
                </details>
              </Card>
            ) : null}

            {groupedStages.map(({ summary: groupSummary, stages: groupStages }) => {
              const tone = getGroupTone(groupSummary.missing);
              return (
                <Card
                  key={groupSummary.key}
                  style={{
                    ...sectionCardStyle,
                    border: `1px solid ${tone.border}`,
                    background: tone.panel,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>
                          {groupSummary.label} · {groupSummary.filled}/{groupSummary.total} 已交
                        </div>
                        <div style={{ marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>
                          {groupSummary.desc || GROUP_META[groupSummary.key].desc}
                        </div>
                      </div>
                      <span style={chipStyle(tone.chipBg, tone.chipFg, 700)}>
                        {groupSummary.missing > 0 ? `缺 ${groupSummary.missing} 项` : "已齐全"}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {groupStages.map((stage) => (
                        <StageCard key={stage.key} stage={stage} />
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </PageShell>
  );
};

export default PaperPipelinePage;
