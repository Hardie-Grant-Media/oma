import { z } from "zod";
export const shareToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const sharePassword = z
  .string()
  .max(72)
  .refine(
    (s) => new TextEncoder().encode(s).length <= 72 && !s.includes("\0"),
    "Password must be at most 72 bytes.",
  );
export async function hashShareToken(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function shareViewerUrl(value: string | undefined) {
  if (!value) throw new Error("Report hosting is not configured.");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  ) {
    throw new Error("Invalid report hosting URL.");
  }
  return url;
}
