import { useCallback, useEffect, useState } from "react";
import { getMe, larkLogin as requestLarkLogin } from "../api/auth";
import { getLarkCode } from "../utils/lark";
import type { Member } from "../types/api";

export type Me = Member;

export const useAuth = () => {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("jwt") || "";

  useEffect(() => {
    const token = localStorage.getItem("jwt");

    if (!token) {
      setLoading(false);
      return;
    }

    getMe()
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  return { me, loading, token };
};

export const larkLogin = async (code: string) => {
  const response = await requestLarkLogin(code);
  localStorage.setItem("jwt", response.token);
  return response.user;
};

export const useLarkLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    const appId = import.meta.env.VITE_LARK_APP_ID;

    if (!appId) {
      throw new Error("missing VITE_LARK_APP_ID");
    }

    setLoading(true);
    setError(null);

    try {
      const code = await getLarkCode(appId);
      return await larkLogin(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : "飞书登录失败";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, login };
};
