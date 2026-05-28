import { chipStyle } from "./ui";

export default function PositionChip({ position }: { position?: string | null }) {
  if (!position) {
    return null;
  }

  return <span style={chipStyle("#f3f4f6", "#4b5563")}>{position}</span>;
}
