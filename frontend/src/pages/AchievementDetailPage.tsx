import type { ChangeEvent, CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Button, Card, Dialog, ImageViewer, Toast } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import {
  aClassFileUrl,
  getAClassAchievement,
  patchAClassAttachments,
  uploadAClassFile,
  type AClassAchievementRead,
  type AClassAttachment,
  type AClassKind,
} from "../api/aClassAchievements";
import { useAuth } from "../hooks/useAuth";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const fileCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  background: "#ffffff",
  position: "relative",
};

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

const formatBytes = (n?: number): string => {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = n;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
};

const Field = ({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ width: 84, color: colors.muted, fontSize: 12, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
};

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "操作失败";
};

const getFilesByKind = (detail: AClassAchievementRead, kind: AClassKind): AClassAttachment[] => {
  if (kind === "pdf") return detail.pdf_files || [];
  if (kind === "image") return detail.image_files || [];
  return detail.extra_files || [];
};

const replaceFilesByKind = (
  detail: AClassAchievementRead,
  kind: AClassKind,
  files: AClassAttachment[],
): AClassAchievementRead => {
  if (kind === "pdf") return { ...detail, pdf_files: files };
  if (kind === "image") return { ...detail, image_files: files };
  return { ...detail, extra_files: files };
};

const getInputAccept = (kind: AClassKind) => {
  if (kind === "pdf") return "application/pdf";
  if (kind === "image") return "image/*";
  return undefined;
};

const deleteButtonStyle = (disabled: boolean, light = false): CSSProperties => ({
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 1,
  minWidth: 24,
  width: 24,
  height: 24,
  padding: 0,
  border: "none",
  borderRadius: 999,
  background: light ? "rgba(255, 255, 255, 0.78)" : "rgba(15, 23, 42, 0.08)",
  color: disabled ? "rgba(185, 28, 28, 0.45)" : "#991b1b",
  fontSize: 14,
  lineHeight: 1,
  opacity: disabled ? 0.72 : 1,
});

const AttachmentRow = ({
  file,
  href,
  deleting,
  onDelete,
}: {
  file: AClassAttachment;
  href: string;
  deleting: boolean;
  onDelete: () => void;
}) => (
  <div style={{ ...fileCardStyle, paddingRight: 44 }}>
    <Button size="mini" disabled={deleting} onClick={onDelete} style={deleteButtonStyle(deleting)}>
      ✕
    </Button>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ color: colors.body, fontSize: 13, fontWeight: 700, lineHeight: 1.5, wordBreak: "break-all" }}>
        {file.name || "未命名附件"}
      </div>
      {file.size ? <div style={{ marginTop: 4, color: colors.muted, fontSize: 11 }}>{formatBytes(file.size)}</div> : null}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        download={file.name || undefined}
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
        下载
      </a>
    </div>
  </div>
);

const AttachmentSectionHeader = ({
  title,
  count,
  buttonText,
  accept,
  loading,
  disabled,
  onChange,
}: {
  title: string;
  count: number;
  buttonText: string;
  accept?: string;
  loading: boolean;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
    <div style={{ color: colors.title, fontSize: 15, fontWeight: 800 }}>{`${title} (${count})`}</div>
    <label style={{ display: "inline-flex" }}>
      <input type="file" hidden multiple accept={accept} onChange={onChange} />
      <Button
        size="mini"
        color="primary"
        fill="outline"
        loading={loading}
        disabled={disabled}
        style={{ "--border-radius": "999px" } as CSSProperties}
      >
        {buttonText}
      </Button>
    </label>
  </div>
);

const AchievementDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { token } = useAuth();
  const [detail, setDetail] = useState<AClassAchievementRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [writing, setWriting] = useState(false);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setNotFound(false);

    getAClassAchievement(id)
      .then((data) => {
        if (!active) return;
        setDetail(data);
      })
      .catch(() => {
        if (!active) return;
        setNotFound(true);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const imageItems = useMemo(
    () => (detail?.image_files || []).map((file) => ({ file, href: aClassFileUrl(file.file_token, token) })),
    [detail?.image_files, token],
  );
  const imageUrls = useMemo(() => imageItems.map((entry) => entry.href), [imageItems]);

  if (loading) {
    return <PageShell><SectionLoading text="正在加载成果详情..." /></PageShell>;
  }
  if (notFound || !detail) {
    return <PageShell><SectionError title="成果不存在" description="请返回列表重新选择。" /></PageShell>;
  }

  const pdfFiles = detail.pdf_files || [];
  const imageFiles = detail.image_files || [];
  const extraFiles = detail.extra_files || [];
  const mergedNotes = detail.notes?.trim();
  const sectionBusyStyle: CSSProperties = {
    opacity: writing ? 0.55 : 1,
    transition: "opacity 0.2s ease",
  };

  const setUploadingFlag = (kind: AClassKind, value: boolean) => {
    if (kind === "pdf") {
      setUploadingPdf(value);
      return;
    }
    if (kind === "image") {
      setUploadingImage(value);
      return;
    }
    setUploadingExtra(value);
  };

  const handleUpload = async (kind: AClassKind, files: File[]) => {
    if (!files.length) return;
    if (files.some((file) => file.size > MAX_UPLOAD_SIZE)) {
      Toast.show({ content: "文件过大, 单文件需 ≤ 25MB" });
      return;
    }

    const previousDetail = detail;
    try {
      setWriting(true);
      setUploadingFlag(kind, true);
      const uploadedFiles = await Promise.all(files.map((file) => uploadAClassFile(file)));
      const existingTokens = getFilesByKind(previousDetail, kind).map((file) => file.file_token);
      const updated = await patchAClassAttachments(previousDetail.base_record_id, kind, [
        ...existingTokens,
        ...uploadedFiles.map((file) => file.file_token),
      ]);
      setDetail(updated);
      Toast.show({ icon: "success", content: "已上传" });
    } catch (err) {
      setDetail(previousDetail);
      Toast.show({ icon: "fail", content: String(extractMessage(err)) });
    } finally {
      setUploadingFlag(kind, false);
      setWriting(false);
    }
  };

  const handleInputChange = async (kind: AClassKind, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await handleUpload(kind, files);
  };

  const handleDelete = async (kind: AClassKind, file: AClassAttachment) => {
    const confirmed = await Dialog.confirm({
      content: `确认删除附件 "${file.name || "未命名附件"}"?`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) return;

    const previousDetail = detail;
    const nextFiles = getFilesByKind(previousDetail, kind).filter((entry) => entry.file_token !== file.file_token);

    try {
      setWriting(true);
      setDeletingToken(file.file_token);
      setDetail(replaceFilesByKind(previousDetail, kind, nextFiles));
      if (kind === "image" && viewerVisible) {
        setViewerVisible(false);
      }
      const updated = await patchAClassAttachments(
        previousDetail.base_record_id,
        kind,
        nextFiles.map((entry) => entry.file_token),
      );
      setDetail(updated);
      setViewerIndex((current) => Math.max(0, Math.min(current, Math.max((updated.image_files || []).length - 1, 0))));
      Toast.show({ icon: "success", content: "已删除" });
    } catch (err) {
      setDetail(previousDetail);
      Toast.show({ icon: "fail", content: String(extractMessage(err)) });
    } finally {
      setDeletingToken(null);
      setWriting(false);
    }
  };

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            fill="solid"
            color="primary"
            style={{
              "--text-color": "#ffffff",
              "--background-color": colors.primary,
              "--border-radius": "999px",
            } as CSSProperties}
            onClick={() => navigate(-1)}
          >
            返回上一页
          </Button>
        </div>

        <Card style={sectionCardStyle}>
          <div style={{ color: colors.title, fontSize: 22, fontWeight: 800, lineHeight: 1.35 }}>
            {detail.event_name || "未命名成果"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {detail.level ? <span style={chipStyle("#dbeafe", "#1d4ed8", 700)}>{detail.level}</span> : null}
            {detail.award_grade ? <span style={chipStyle("#ffedd5", "#c2410c", 700)}>{detail.award_grade}</span> : null}
            {detail.research_category ? <span style={chipStyle("#dcfce7", "#15803d", 700)}>{detail.research_category}</span> : null}
            {detail.department ? <span style={chipStyle("#f3f4f6", "#4b5563", 600)}>{detail.department}</span> : null}
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="时间" value={detail.event_date} />
            <Field label="主办方" value={detail.organizer} />
            <Field label="责任人" value={detail.responsible_person} />
            <Field label="第一学生" value={detail.first_student} />
            <Field label="其他学生" value={detail.other_students} />
          </div>
        </Card>

        {detail.project_content ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 15, fontWeight: 800, marginBottom: 10 }}>项目内容</div>
            <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {detail.project_content}
            </div>
          </Card>
        ) : null}

        {(detail.ai_image_understanding || detail.kimi_summary) ? (
          <Card style={sectionCardStyle}>
            <details>
              <summary style={{ color: colors.title, fontSize: 15, fontWeight: 800, cursor: "pointer", listStyle: "none" }}>
                AI 提取
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
                {detail.ai_image_understanding ? (
                  <div>
                    <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>AI 图片理解</div>
                    <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                      {detail.ai_image_understanding}
                    </div>
                  </div>
                ) : null}
                {detail.kimi_summary ? (
                  <div>
                    <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Kimi 阅读助手</div>
                    <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                      {detail.kimi_summary}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          </Card>
        ) : null}

        <Card style={{ ...sectionCardStyle, ...sectionBusyStyle }}>
          <AttachmentSectionHeader
            title="图片"
            count={imageFiles.length}
            buttonText="上传图片"
            accept={getInputAccept("image")}
            loading={uploadingImage}
            disabled={writing}
            onChange={(event) => void handleInputChange("image", event)}
          />
          <div style={gridStyle}>
            {imageItems.map(({ file, href }, index) => (
              <div key={`${file.file_token}-${index}`} style={{ position: "relative" }}>
                <Button
                  size="mini"
                  disabled={writing}
                  onClick={() => void handleDelete("image", file)}
                  style={deleteButtonStyle(deletingToken === file.file_token, true)}
                >
                  ✕
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setViewerIndex(index);
                    setViewerVisible(true);
                  }}
                  disabled={writing}
                  style={{
                    padding: 0,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#ffffff",
                    aspectRatio: "1 / 1",
                    cursor: writing ? "wait" : "pointer",
                    width: "100%",
                    opacity: deletingToken === file.file_token ? 0.72 : 1,
                  }}
                >
                  <img
                    src={href}
                    alt={file.name || `成果图片 ${index + 1}`}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </button>
              </div>
            ))}
          </div>
          {!imageItems.length ? <div style={{ marginTop: 10, color: colors.muted, fontSize: 13 }}>暂无图片</div> : null}
        </Card>

        <Card style={{ ...sectionCardStyle, ...sectionBusyStyle }}>
          <AttachmentSectionHeader
            title="PDF"
            count={pdfFiles.length}
            buttonText="上传 PDF"
            accept={getInputAccept("pdf")}
            loading={uploadingPdf}
            disabled={writing}
            onChange={(event) => void handleInputChange("pdf", event)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pdfFiles.length === 1 ? (
              <iframe
                src={aClassFileUrl(pdfFiles[0].file_token, token)}
                title={pdfFiles[0].name || "PDF 附件预览"}
                loading="lazy"
                style={{
                  width: "100%",
                  height: 480,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  background: "#ffffff",
                }}
              />
            ) : null}
            {pdfFiles.map((file) => (
              <AttachmentRow
                key={file.file_token}
                file={file}
                href={aClassFileUrl(file.file_token, token)}
                deleting={deletingToken === file.file_token}
                onDelete={() => void handleDelete("pdf", file)}
              />
            ))}
            {!pdfFiles.length ? <div style={{ color: colors.muted, fontSize: 13 }}>暂无 PDF</div> : null}
          </div>
        </Card>

        <Card style={{ ...sectionCardStyle, ...sectionBusyStyle }}>
          <AttachmentSectionHeader
            title="其他附件"
            count={extraFiles.length}
            buttonText="上传附件"
            loading={uploadingExtra}
            disabled={writing}
            onChange={(event) => void handleInputChange("extra", event)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {extraFiles.map((file) => (
              <AttachmentRow
                key={file.file_token}
                file={file}
                href={aClassFileUrl(file.file_token, token)}
                deleting={deletingToken === file.file_token}
                onDelete={() => void handleDelete("extra", file)}
              />
            ))}
            {!extraFiles.length ? <div style={{ color: colors.muted, fontSize: 13 }}>暂无附件</div> : null}
          </div>
        </Card>

        {mergedNotes ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 15, fontWeight: 800, marginBottom: 10 }}>备注</div>
            <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {mergedNotes}
            </div>
          </Card>
        ) : null}
      </div>

      <ImageViewer.Multi
        images={imageUrls}
        visible={viewerVisible}
        defaultIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </PageShell>
  );
};

export default AchievementDetailPage;
