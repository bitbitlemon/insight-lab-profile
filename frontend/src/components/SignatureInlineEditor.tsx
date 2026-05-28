import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, TextArea, Toast } from "antd-mobile";
import axios from "axios";
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

const iconButtonStyle: CSSProperties = {
  width: 20,
  height: 20,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: colors.placeholder,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
};

const editIconStyle: CSSProperties = {
  width: 14,
  height: 14,
  flex: "0 0 auto",
};

interface SignatureInlineEditorProps {
  value?: string | null;
  onSave: (value: string) => Promise<void>;
}

export default function SignatureInlineEditor({ value, onSave }: SignatureInlineEditorProps) {
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
    const nextValue = draft.trim();
    if (nextValue.length > 50) {
      Toast.show({ icon: "fail", content: "个性签名不能超过 50 个字符" });
      return;
    }

    setSaving(true);
    try {
      await onSave(nextValue);
      setEditing(false);
      Toast.show({ icon: "success", content: "个性签名已更新" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        <TextArea
          value={draft}
          onChange={(nextValue) => setDraft(nextValue.slice(0, 50))}
          placeholder="填写个性签名"
          autoSize={{ minRows: 1, maxRows: 3 }}
          maxLength={50}
          style={{
            "--font-size": "14px",
            "--color": colors.body,
            "--placeholder-color": colors.placeholder,
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${colors.border}`,
            background: "#ffffff",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          <span style={{ color: colors.placeholder, fontSize: 11 }}>{draft.length}/50</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 20 }}>
      <span style={{ color: value ? colors.muted : colors.placeholder, fontSize: 14, lineHeight: 1.6 }}>
        {value || "填写个性签名"}
      </span>
      <button type="button" onClick={() => setEditing(true)} style={iconButtonStyle} aria-label="编辑个性签名">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={editIconStyle} aria-hidden="true">
          <path d="M12 20h9" />
          <path d="m16.5 3.5 4 4L7 21H3v-4z" />
        </svg>
      </button>
    </div>
  );
}
