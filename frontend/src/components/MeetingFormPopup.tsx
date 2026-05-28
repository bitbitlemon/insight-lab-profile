import { lazy, Suspense } from "react";
import { Popup } from "antd-mobile";
import { colors } from "./ui";

const MeetingFormBody = lazy(() => import("./MeetingFormBody"));

interface MeetingFormPopupProps {
  visible: boolean;
  title?: string;
  initialDate?: Date;
  onClose: () => void;
  onSuccess: () => void;
}

const MeetingFormPopup = ({ visible, title = "新建会议", initialDate, onClose, onSuccess }: MeetingFormPopupProps) => (
  <Popup
    visible={visible}
    position="bottom"
    destroyOnClose
    onMaskClick={onClose}
    bodyStyle={{
      height: "85vh",
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
        <div style={{ fontSize: 17, fontWeight: 800, color: colors.title }}>{title}</div>
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

      <div style={{ flex: 1, overflowY: "auto", padding: 16, paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <Suspense fallback={<div style={{ fontSize: 13, color: colors.muted }}>正在加载会议表单...</div>}>
          <MeetingFormBody onSuccess={onSuccess} onCancel={onClose} initialDate={initialDate} />
        </Suspense>
      </div>
    </div>
  </Popup>
);

export default MeetingFormPopup;
