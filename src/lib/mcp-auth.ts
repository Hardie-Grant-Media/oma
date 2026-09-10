const key = "oma.oauth.authorization";
export function rememberAuthorization(id: string) {
  if (/^[A-Za-z0-9_-]{16,200}$/.test(id))
    sessionStorage.setItem(key, JSON.stringify({ id, at: Date.now() }));
}
export function pendingAuthorization(): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value &&
      Date.now() - value.at < 10 * 60 * 1000 &&
      /^[A-Za-z0-9_-]{16,200}$/.test(value.id)
      ? value.id
      : null;
  } catch {
    return null;
  }
}
export function clearAuthorization() {
  sessionStorage.removeItem(key);
}
export function mcpClientIds() {
  return String(import.meta.env.VITE_OMA_MCP_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function safeOAuthRedirect(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ((url.hostname === "127.0.0.1" &&
          /^\/callback(?:\/[A-Za-z0-9_-]+)?$/.test(url.pathname)) ||
          (import.meta.env.DEV &&
            ["localhost", "127.0.0.1"].includes(url.hostname)))
      ))
  )
    throw new Error("Invalid connection redirect.");
  return url.href;
}
