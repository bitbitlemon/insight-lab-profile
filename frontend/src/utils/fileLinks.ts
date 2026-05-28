export const authQueryName = "token";

export const currentJwt = (): string => localStorage.getItem("jwt") || "";

export const appendAuthToken = (url: string, token = currentJwt()): string => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${authQueryName}=${encodeURIComponent(token)}`;
};

export const fileConfirmUrl = (href: string, name?: string | null, mode: "download" | "open" = "download"): string => {
  const params = new URLSearchParams({ href, mode });
  if (name) params.set("name", name);
  return `/files/confirm?${params.toString()}`;
};
