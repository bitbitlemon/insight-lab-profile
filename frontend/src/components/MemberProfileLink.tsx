import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "./ui";

export const getMemberProfilePath = (openId: string, viewerOpenId?: string | null) =>
  viewerOpenId && openId === viewerOpenId ? "/profile" : `/members/${openId}`;

const triggerBaseStyle: CSSProperties = {
  padding: 0,
  border: "none",
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

interface MemberAvatarLinkProps {
  openId: string;
  viewerOpenId?: string | null;
  src?: string;
  name: string;
  size: number;
  receiptStatus?: "received" | "pending";
  style?: CSSProperties;
}

export const MemberAvatarLink = ({ openId, viewerOpenId, src, name, size, receiptStatus, style }: MemberAvatarLinkProps) => {
  const navigate = useNavigate();

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        navigate(getMemberProfilePath(openId, viewerOpenId));
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        navigate(getMemberProfilePath(openId, viewerOpenId));
      }}
      style={{ ...triggerBaseStyle, position: "relative", ...style }}
    >
      <Avatar src={src} name={name} size={size} />
      {receiptStatus ? (
        <span
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: Math.max(14, Math.round(size * 0.36)),
            height: Math.max(14, Math.round(size * 0.36)),
            borderRadius: "50%",
            border: "2px solid #fff",
            background: receiptStatus === "received" ? "#16a34a" : "#ef4444",
            color: "#fff",
            fontSize: Math.max(9, Math.round(size * 0.22)),
            fontWeight: 900,
            lineHeight: `${Math.max(14, Math.round(size * 0.36)) - 4}px`,
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(15,23,42,0.18)",
          }}
        >
          {receiptStatus === "received" ? "✓" : "×"}
        </span>
      ) : null}
    </span>
  );
};

interface MemberNameLinkProps {
  openId: string;
  viewerOpenId?: string | null;
  children: ReactNode;
  style?: CSSProperties;
}

export const MemberNameLink = ({ openId, viewerOpenId, children, style }: MemberNameLinkProps) => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        navigate(getMemberProfilePath(openId, viewerOpenId));
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        navigate(getMemberProfilePath(openId, viewerOpenId));
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...style,
        cursor: "pointer",
        color: hovered ? "#1677ff" : style?.color,
        transition: "color 160ms ease",
      }}
    >
      {children}
    </span>
  );
};
