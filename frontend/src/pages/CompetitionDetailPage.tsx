import type { ChangeEvent, CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Button, Card, Dialog, DotLoading, ImageViewer, Toast } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import {
  competitionFileProxyUrl,
  getCompetition,
  uploadCompetitionFile,
  updateCompetition,
  updateCompetitionMemberContribution,
  type Competition,
  type CompetitionAttachment,
} from "../api/competitions";
import ContributionInlineEditor from "../components/ContributionInlineEditor";
import { MemberAvatarLink, MemberNameLink } from "../components/MemberProfileLink";
import { useMemberDirectory } from "../components/MemberPicker";
import PointsSummaryBadge from "../components/PointsSummaryBadge";
import { TitleChip } from "../components/TitleChip";
import { useAuth } from "../hooks/useAuth";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";

const LinkRow = ({ label, href }: { label: string; href: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 999,
      background: colors.primarySoft,
      color: colors.primaryDeep,
      fontSize: 13,
      fontWeight: 600,
      textDecoration: "none",
      border: `1px solid ${colors.primarySoft}`,
    }}
  >
    {label} →
  </a>
);

const Field = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ width: 84, color: colors.muted, fontSize: 12, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, color: colors.body, fontSize: 13, lineHeight: 1.6, wordBreak: "break-word" }}>{String(value)}</div>
    </div>
  );
};

const formatBytes = (n?: number | null): string => {
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

const getFileKind = (name?: string | null, type?: string | null): FileKind => {
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  if (EXT_KIND[ext]) return EXT_KIND[ext];
  if (type?.includes("pdf")) return "pdf";
  if (type?.startsWith("image/")) return "image";
  return "other";
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

const competitionRoleStyle = {
  member: { bg: "#eef2ff", fg: "#4338ca", label: "成员" },
  advisor: { bg: "#ecfeff", fg: "#0f766e", label: "指导" },
} as const;

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

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

const AttachmentRow = ({
  file,
  canDelete,
  deleting,
  onDelete,
}: {
  file: CompetitionAttachment;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) => {
  const kind = getFileKind(file.name, file.type);
  const href = file.file_token ? competitionFileProxyUrl(file) : "";
  const isPdf = kind === "pdf";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 12,
        background: "#ffffff",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {kind === "image" && href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              overflow: "hidden",
              border: `1px solid ${colors.border}`,
              display: "block",
              flexShrink: 0,
              background: "#ffffff",
            }}
          >
            <img
              src={href}
              alt={file.name || "比赛证书"}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </a>
        ) : (
          <FileTypeIcon kind={kind} size={40} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: colors.body, fontSize: 13, fontWeight: 600, lineHeight: 1.45, wordBreak: "break-all" }}>
            {file.name || "未命名证书"}
          </div>
          {file.size ? <div style={{ marginTop: 2, color: colors.muted, fontSize: 11 }}>{formatBytes(file.size)}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {href ? (
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
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "none",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: 16,
                lineHeight: 1,
                cursor: deleting ? "wait" : "pointer",
                opacity: deleting ? 0.6 : 1,
              }}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>
      {isPdf && href ? (
        <iframe
          src={href}
          title={file.name || "比赛证书预览"}
          loading="lazy"
          style={{
            width: "100%",
            height: 360,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            background: "#ffffff",
          }}
        />
      ) : null}
    </div>
  );
};

const CompetitionDetailPage = () => {
  const navigate = useNavigate();
  const { comp_id } = useParams();
  const { me } = useAuth();
  const { members } = useMemberDirectory();
  const [comp, setComp] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [uploadingCerts, setUploadingCerts] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [deletingFileToken, setDeletingFileToken] = useState<string | null>(null);
  const certInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const memberMap = useMemo(
    () =>
      members.reduce<Record<string, (typeof members)[number]>>((acc, member) => {
        acc[member.open_id] = member;
        return acc;
      }, {}),
    [members],
  );

  useEffect(() => {
    if (!comp_id) return;
    setLoading(true);
    getCompetition(comp_id)
      .then((c) => setComp(c))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [comp_id]);

  if (loading) return <PageShell><SectionLoading text="正在加载比赛..." /></PageShell>;
  if (notFound || !comp) return <PageShell><SectionError title="比赛不存在" description="请返回列表重新选择" /></PageShell>;

  const certFiles = comp.cert_files || [];
  const photoFiles = comp.photo_files || [];
  const hasMaterials = certFiles.length > 0 || photoFiles.length > 0;
  const isCreator = Boolean(me?.open_id && me.open_id === comp.created_by);
  const isCompetitionMember = Boolean(me?.open_id && comp.members?.some((member) => member.member_open_id === me.open_id));
  const canManageMaterials = Boolean(me && (me.role === "admin" || isCreator || isCompetitionMember));
  const photoItems = photoFiles.map((file) => ({
    file,
    href: file.file_token ? competitionFileProxyUrl(file) : "",
  }));
  const photoViewerImages = photoItems
    .filter((item) => Boolean(item.href))
    .map((item) => item.href);

  const handleContributionSave = async (memberOpenId: string, contributionText: string | null) => {
    const updated = await updateCompetitionMemberContribution(comp.comp_id, memberOpenId, contributionText);
    setComp(updated);
  };

  const validateFiles = (files: File[]) => {
    for (const file of files) {
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(`${file.name} 超过 25MB 限制`);
      }
    }
  };

  const handleUpload = async (kind: "cert" | "photo", files: File[]) => {
    if (!files.length) return;
    try {
      validateFiles(files);
      kind === "cert" ? setUploadingCerts(true) : setUploadingPhotos(true);
      const uploadedFiles = await Promise.all(files.map((file) => uploadCompetitionFile(file)));
      const payload = kind === "cert"
        ? { cert_files: [...certFiles, ...uploadedFiles] }
        : { photo_files: [...photoFiles, ...uploadedFiles] };
      const updated = await updateCompetition(comp.comp_id, payload);
      setComp(updated);
      Toast.show({ icon: "success", content: kind === "cert" ? "证书已上传" : "照片已上传" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      kind === "cert" ? setUploadingCerts(false) : setUploadingPhotos(false);
    }
  };

  const handleInputChange = async (kind: "cert" | "photo", event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await handleUpload(kind, files);
  };

  const handleDelete = async (kind: "cert" | "photo", fileToken: string) => {
    const confirmed = await Dialog.confirm({
      content: "确定删除?",
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) return;

    try {
      setDeletingFileToken(fileToken);
      if (kind === "photo" && photoViewerVisible) {
        setPhotoViewerVisible(false);
      }
      const payload = kind === "cert"
        ? { cert_files: certFiles.filter((file) => file.file_token !== fileToken) }
        : { photo_files: photoFiles.filter((file) => file.file_token !== fileToken) };
      const updated = await updateCompetition(comp.comp_id, payload);
      setComp(updated);
      setPhotoViewerIndex((current) => Math.max(0, Math.min(current, Math.max((updated.photo_files || []).length - 1, 0))));
      Toast.show({ icon: "success", content: "已删除" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setDeletingFileToken(null);
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
          <Button
            fill="outline"
            color="primary"
            style={{ "--border-radius": "999px" } as CSSProperties}
            onClick={() => navigate(`/competitions/${comp.comp_id}/edit`)}
          >
            编辑
          </Button>
        </div>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.title, lineHeight: 1.3, flex: 1, minWidth: 0 }}>{comp.name}</div>
            <PointsSummaryBadge summary={comp.points_summary} />
          </div>
          <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>{comp.organizer}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {comp.level ? <span style={chipStyle("#dbeafe", "#1e40af")}>{comp.level}</span> : null}
            {comp.award_level ? <span style={chipStyle("#fef3c7", "#92400e")}>{comp.award_level}</span> : null}
            {comp.rank ? <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>名次 {comp.rank}</span> : null}
            {comp.category ? <span style={chipStyle("#eef2ff", "#4338ca", 500)}>{comp.category}</span> : null}
          </div>
        </Card>

        {(comp.certificate_url || comp.project_url) ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>相关链接</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {comp.certificate_url ? <LinkRow label="查看证书" href={comp.certificate_url} /> : null}
              {comp.project_url ? <LinkRow label="项目链接" href={comp.project_url} /> : null}
            </div>
          </Card>
        ) : null}

        <Card style={sectionCardStyle}>
          <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>详情</div>
          <Field label="开始日期" value={comp.start_date} />
          <Field label="结束日期" value={comp.end_date} />
          <Field label="队长" value={comp.team_lead_open_id} />
          <Field label="得分" value={comp.score ?? null} />
          {comp.description ? (
            <div style={{ paddingTop: 10 }}>
              <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>描述</div>
              <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{comp.description}</div>
            </div>
          ) : null}
          {comp.reflection ? (
            <div style={{ paddingTop: 10 }}>
              <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>心得</div>
              <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{comp.reflection}</div>
            </div>
          ) : null}
        </Card>

        {comp.members && comp.members.length > 0 ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>成员</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {comp.members.map((member) => {
                const profile = memberMap[member.member_open_id];
                const role = competitionRoleStyle[member.member_role];
                const canEdit = me?.open_id === member.member_open_id;
                const isLead = comp.team_lead_open_id === member.member_open_id;

                return (
                  <div
                    key={`${member.member_open_id}-${member.member_role}`}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: `1px solid ${colors.border}`,
                      background: "#ffffff",
                    }}
                  >
                    <MemberAvatarLink
                      openId={member.member_open_id}
                      viewerOpenId={me?.open_id}
                      src={profile?.avatar_url}
                      name={profile?.name || member.member_open_id}
                      size={44}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <MemberNameLink
                          openId={member.member_open_id}
                          viewerOpenId={me?.open_id}
                          style={{ fontSize: 14, fontWeight: 700, color: colors.title }}
                        >
                          {profile?.name || member.member_open_id}
                        </MemberNameLink>
                        <TitleChip title={profile?.title} />
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        <span style={chipStyle(role.bg, role.fg, 600)}>{role.label}</span>
                        {isLead ? <span style={chipStyle("#fef3c7", "#92400e", 600)}>负责人</span> : null}
                      </div>
                      <ContributionInlineEditor
                        value={member.contribution_text}
                        canEdit={canEdit}
                        label={canEdit ? "我的贡献" : "贡献"}
                        onSave={(value) => handleContributionSave(member.member_open_id, value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {(hasMaterials || canManageMaterials) ? (
          <Card style={sectionCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ color: colors.title, fontSize: 16, fontWeight: 800 }}>获奖材料</div>
                <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>证书 + 现场照片</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: colors.title, fontSize: 14, fontWeight: 700 }}>比赛证书</div>
                  <span style={chipStyle("#eef2ff", "#4338ca", 700)}>{certFiles.length} 项</span>
                </div>
                {canManageMaterials ? (
                  <Button
                    size="small"
                    fill="outline"
                    loading={uploadingCerts}
                    disabled={uploadingCerts || uploadingPhotos}
                    style={{ "--border-radius": "999px" } as CSSProperties}
                    onClick={() => certInputRef.current?.click()}
                  >
                    {uploadingCerts ? "上传中" : "添加证书"}
                  </Button>
                ) : null}
              </div>
              <input
                ref={certInputRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                hidden
                onChange={(event) => void handleInputChange("cert", event)}
              />
              {certFiles.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {certFiles.map((file) => (
                    <AttachmentRow
                      key={`cert-${file.file_token}`}
                      file={file}
                      canDelete={canManageMaterials}
                      deleting={deletingFileToken === file.file_token}
                      onDelete={() => void handleDelete("cert", file.file_token)}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ color: colors.muted, fontSize: 13 }}>
                  {uploadingCerts ? <>证书上传中<DotLoading /></> : "暂无证书"}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: colors.title, fontSize: 14, fontWeight: 700 }}>现场照片</div>
                  <span style={chipStyle("#dcfce7", "#15803d", 700)}>{photoFiles.length} 张</span>
                </div>
                {canManageMaterials ? (
                  <Button
                    size="small"
                    fill="outline"
                    loading={uploadingPhotos}
                    disabled={uploadingPhotos || uploadingCerts}
                    style={{ "--border-radius": "999px" } as CSSProperties}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {uploadingPhotos ? "上传中" : "添加照片"}
                  </Button>
                ) : null}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => void handleInputChange("photo", event)}
              />
              {photoFiles.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                  }}
                >
                  {photoItems.map(({ file, href }, index) => {
                    const viewerIndex = photoItems.slice(0, index + 1).filter((item) => Boolean(item.href)).length - 1;
                    return (
                      <div
                        key={`photo-${file.file_token || index}`}
                        style={{ position: "relative" }}
                      >
                        {canManageMaterials ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete("photo", file.file_token)}
                            disabled={deletingFileToken === file.file_token}
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              zIndex: 1,
                              width: 24,
                              height: 24,
                              borderRadius: 999,
                              border: "none",
                              background: "rgba(127, 29, 29, 0.88)",
                              color: "#ffffff",
                              fontSize: 14,
                              lineHeight: 1,
                              cursor: deletingFileToken === file.file_token ? "wait" : "pointer",
                              opacity: deletingFileToken === file.file_token ? 0.7 : 1,
                            }}
                          >
                            ✕
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            if (!href) return;
                            setPhotoViewerIndex(viewerIndex);
                            setPhotoViewerVisible(true);
                          }}
                          style={{
                            padding: 0,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 10,
                            overflow: "hidden",
                            background: "#ffffff",
                            aspectRatio: "1 / 1",
                            cursor: href ? "pointer" : "default",
                            width: "100%",
                          }}
                        >
                          {href ? (
                            <img
                              src={href}
                              alt={file.name || `现场照片 ${index + 1}`}
                              loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <FileTypeIcon kind="image" size={32} />
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: colors.muted, fontSize: 13 }}>
                  {uploadingPhotos ? <>照片上传中<DotLoading /></> : "暂无照片"}
                </div>
              )}
            </div>
          </Card>
        ) : null}
      </div>

      <ImageViewer.Multi
        images={photoViewerImages}
        visible={photoViewerVisible}
        defaultIndex={photoViewerIndex}
        onClose={() => setPhotoViewerVisible(false)}
      />
    </PageShell>
  );
};

export default CompetitionDetailPage;
