import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import axios from "axios";
import { Button, SpinLoading, TextArea, Toast } from "antd-mobile";
import { colors } from "./ui";

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "保存失败";
};

const actionLinkStyle: CSSProperties = {
  border: "none",
  padding: 0,
  background: "transparent",
  color: colors.primaryDeep,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

interface ContributionInlineEditorProps {
  value?: string | null;
  canEdit?: boolean;
  emptyText?: string;
  label?: string;
  onSave?: (value: string | null) => Promise<void>;
}

const ContributionInlineEditor = ({
  value,
  canEdit = false,
  emptyText = "尚未填写贡献描述",
  label = "我的贡献",
  onSave,
}: ContributionInlineEditorProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(value || "");
    }
  }, [editing, value]);

  const handleCancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const nextValue = draft.trim();
      await onSave(nextValue ? nextValue : null);
      setEditing(false);
      Toast.show({ icon: "success", content: "贡献描述已保存" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <TextArea
          value={draft}
          onChange={setDraft}
          placeholder="写一下你具体做了什么"
          autoSize={{ minRows: 3, maxRows: 5 }}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${colors.border}`,
            background: "#ffffff",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button
            size="small"
            color="primary"
            loading={saving}
            style={{ "--background-color": colors.primary, "--border-radius": "999px" } as CSSProperties}
            onClick={() => void handleSave()}
          >
            保存
          </Button>
          <Button size="small" fill="outline" onClick={handleCancel} disabled={saving}>
            取消
          </Button>
          {saving ? <SpinLoading color="primary" style={{ "--color": colors.primary } as CSSProperties} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: colors.placeholder, fontSize: 12, flexShrink: 0 }}>{label}</span>
        {canEdit ? (
          <button type="button" style={actionLinkStyle} onClick={() => setEditing(true)}>
            编辑
          </button>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 4,
          color: value ? colors.body : colors.muted,
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || emptyText}
      </div>
    </div>
  );
};

export default ContributionInlineEditor;
