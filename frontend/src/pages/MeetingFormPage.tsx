import type { CSSProperties } from "react";
import { Button } from "antd-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import MeetingFormBody from "../components/MeetingFormBody";
import { PageShell, colors } from "../components/ui";

const MeetingFormPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialDateRaw = searchParams.get("start_at");
  const initialDate = initialDateRaw ? new Date(initialDateRaw) : undefined;
  const safeInitialDate = initialDate && !Number.isNaN(initialDate.getTime()) ? initialDate : undefined;

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 96 }}>
        <Button
          fill="none"
          style={{ alignSelf: "flex-start", padding: 0, "--text-color": colors.primaryDeep } as CSSProperties}
          onClick={() => navigate(-1)}
        >
          {"< 返回"}
        </Button>
        <div style={{ fontSize: 24, fontWeight: 800, color: colors.title }}>新建会议</div>
        <MeetingFormBody
          initialDate={safeInitialDate}
          onCancel={() => navigate(-1)}
          onSuccess={() => navigate("/calendar")}
        />
      </div>
    </PageShell>
  );
};

export default MeetingFormPage;
