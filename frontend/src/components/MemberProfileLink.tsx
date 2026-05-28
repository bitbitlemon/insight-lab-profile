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
  style?: CSSProperties;
}

export const MemberAvatarLink = ({ openId, viewerOpenId, src, name, size, style }: MemberAvatarLinkProps) => {
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
      style={{ ...triggerBaseStyle, ...style }}
    >
      <Avatar src={src} name={name} size={size} />
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
