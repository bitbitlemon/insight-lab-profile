import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Popup, TextArea, Toast } from "antd-mobile";
import {
  createMoment,
  momentImageUrl,
  uploadMomentImage,
  type MomentImage,
  type MomentPost,
  type UploadMomentImageResponse,
} from "../api/moments";
import { colors } from "./ui";

const MAX_IMAGES = 9;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface MomentEditorPopupProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (post: MomentPost) => void;
}

const uploadButtonStyle: CSSProperties = {
  border: "1px dashed rgba(99,102,241,0.38)",
  background: "rgba(238,242,255,0.72)",
  borderRadius: 12,
  minHeight: 96,
  color: colors.primaryDeep,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const MomentEditorPopup = ({ visible, onClose, onSuccess }: MomentEditorPopupProps) => {
  const [content, setContent] = useState("");
  const [images, setImages] = useState<UploadMomentImageResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setContent("");
    setImages([]);
    setUploading(false);
    setSubmitting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (visible) {
      return;
    }
    reset();
  }, [visible]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      Toast.show({ icon: "fail", content: `最多上传 ${MAX_IMAGES} 张图片` });
      return;
    }
    const validFiles = files.slice(0, remaining);
    const oversized = validFiles.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      Toast.show({ icon: "fail", content: `${oversized.name} 超过 20MB` });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(validFiles.map((file) => uploadMomentImage(file)));
      setImages((prev) => prev.concat(uploaded));
      if (files.length > remaining) {
        Toast.show({ icon: "success", content: `已上传前 ${remaining} 张图片` });
      }
    } catch (error) {
      console.error(error);
      Toast.show({ icon: "fail", content: "图片上传失败" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text && images.length === 0) {
      Toast.show({ icon: "fail", content: "请填写内容或上传图片" });
      return;
    }
    setSubmitting(true);
    try {
      const payload: { content: string | null; images: MomentImage[] } = {
        content: text || null,
        images: images.map((image) => ({ file_token: image.file_token, name: image.name })),
      };
      const created = await createMoment(payload);
      Toast.show({ icon: "success", content: "发布成功" });
      onSuccess(created);
      onClose();
    } catch (error) {
      console.error(error);
      Toast.show({ icon: "fail", content: "发布失败" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popup
      visible={visible}
      position="bottom"
      destroyOnClose
      onMaskClick={onClose}
      bodyStyle={{
        height: "82vh",
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        background: "#f8fafc",
        overflow: "hidden",
      }}
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            background: "rgba(248,250,252,0.96)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(226,232,240,0.9)",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, color: colors.title }}>发布动态</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: colors.placeholder,
              fontSize: 20,
              lineHeight: 1,
              padding: 0,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "#ffffff",
                borderRadius: 14,
                border: "1px solid rgba(226,232,240,0.88)",
                padding: 12,
              }}
            >
              <TextArea
                value={content}
                onChange={setContent}
                placeholder="分享一下最近的进展、想法或现场照片"
                autoSize={{ minRows: 5, maxRows: 12 }}
                maxLength={2000}
                style={{ "--font-size": "14px" } as CSSProperties}
              />
              <div style={{ marginTop: 8, textAlign: "right", color: colors.muted, fontSize: 12 }}>
                {content.length}/2000
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ color: colors.title, fontSize: 14, fontWeight: 700 }}>图片</div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                hidden
                onChange={(event) => {
                  void handleFilesSelected(event.target.files);
                }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {images.map((image) => (
                  <div
                    key={image.file_token}
                    style={{
                      position: "relative",
                      borderRadius: 12,
                      overflow: "hidden",
                      aspectRatio: "1 / 1",
                      background: "#e2e8f0",
                    }}
                  >
                    <img
                      src={momentImageUrl(image.file_token)}
                      alt={image.name || "动态图片"}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((item) => item.file_token !== image.file_token))}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        border: "none",
                        background: "rgba(15,23,42,0.72)",
                        color: "#ffffff",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {images.length < MAX_IMAGES ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{ ...uploadButtonStyle, opacity: uploading ? 0.72 : 1 }}
                  >
                    {uploading ? "上传中..." : "选择图片"}
                  </button>
                ) : null}
              </div>
              <div style={{ color: colors.muted, fontSize: 12 }}>最多 9 张，单张不超过 20MB</div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Button block fill="outline" onClick={onClose} disabled={submitting}>
                取消
              </Button>
              <Button block color="primary" loading={submitting} onClick={() => void handleSubmit()}>
                发布
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Popup>
  );
};

export default MomentEditorPopup;
