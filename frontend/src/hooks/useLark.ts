import { useEffect, useState } from "react";
import { isInLark } from "../utils/lark";

export const useLark = () => {
  const [ready, setReady] = useState(!isInLark());
  const [inLark] = useState(isInLark());

  useEffect(() => {
    if (!inLark) {
      setReady(true);
      return;
    }

    if (typeof window.tt?.ready === "function") {
      window.tt.ready(() => setReady(true));
      return;
    }

    setReady(true);
  }, [inLark]);

  return { ready, inLark };
};
