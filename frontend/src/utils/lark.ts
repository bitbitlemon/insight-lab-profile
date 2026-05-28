declare global {
  interface Window {
    tt?: {
      ready?: (callback: () => void) => void;
      requestAccess?: (options: {
        appID: string;
        scopeList: string[];
        success: (res: { code: string }) => void;
        fail: (err: unknown) => void;
      }) => void;
    };
    h5sdk?: {
      ready?: (callback: () => void) => void;
      error?: (callback: (err: unknown) => void) => void;
      config?: (params: Record<string, unknown>) => void;
    };
  }
}

export const isInLark = () => typeof window !== "undefined" && (!!window.tt || !!window.h5sdk);

export const larkEnvInfo = () => {
  if (typeof window === "undefined")
    return { ua: "no window", currentUrl: "", redirectUrlForWhitelist: "", hasTt: false, hasH5sdk: false, hasRequestAccess: false, hasH5sdkReady: false, uaHintsLark: false };
  const ua = navigator.userAgent || "";
  const href = window.location.href;
  const redirectUrlForWhitelist = href.split("?")[0].split("#")[0];
  return {
    ua,
    currentUrl: href,
    redirectUrlForWhitelist,
    hasTt: !!window.tt,
    hasH5sdk: !!window.h5sdk,
    hasRequestAccess: !!window.tt?.requestAccess,
    hasH5sdkReady: !!window.h5sdk?.ready,
    uaHintsLark: /Lark|Feishu/i.test(ua),
  };
};

export const waitForLarkReady = (timeoutMs = 3000): Promise<void> =>
  new Promise((resolve) => {
    if (window.h5sdk?.ready) {
      window.h5sdk.ready(() => resolve());
      setTimeout(() => resolve(), timeoutMs);
    } else {
      setTimeout(() => resolve(), 200);
    }
  });

export const getLarkCode = (appId: string): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!window.tt?.requestAccess) {
      reject(new Error("not in lark"));
      return;
    }

    window.tt.requestAccess({
      appID: appId,
      scopeList: [],
      success: (res) => resolve(res.code),
      fail: (err) => reject(err),
    });
  });
