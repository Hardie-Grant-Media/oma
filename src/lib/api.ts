import { createClient } from "@supabase/supabase-js";
import type { Snapshot } from "../../supabase/functions/_shared/domain";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isDemo =
  import.meta.env.DEV && import.meta.env.VITE_DEMO === "true";
export const configured = Boolean(url && key);
export const supabase =
  configured && !isDemo
    ? createClient(url, key, {
        db: { schema: "api" },
        auth: { flowType: "pkce", detectSessionInUrl: false },
      })
    : null;
export async function snapshot(): Promise<Snapshot> {
  if (isDemo) return (await import("./demo")).snapshot();
  if (!supabase) throw new Error("Connect Supabase to begin.");
  const { data, error } = await supabase.rpc("snapshot");
  if (error)
    throw new Error(
      error.message === "Access denied."
        ? "Access denied. Ask an admin."
        : "Sign in to continue.",
    );
  return data as Snapshot;
}
export async function command(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (isDemo) return (await import("./demo")).command(action, payload);
  if (!supabase) throw new Error("Connect Supabase to begin.");
  const { data, error } = await supabase.functions.invoke("api", {
    body: { action, payload },
  });
  if (error) {
    const response = error.context as Response | undefined;
    let message = "Request failed. Try again.";
    try {
      message = (await response?.json())?.error ?? message;
    } catch {
      /* Non-JSON network response. */
    }
    throw new Error(message);
  }
  if (data.error) throw new Error(data.error);
  return data;
}
export async function upload(file: File, payload: Record<string, unknown>) {
  const reserved = await command("reserve_upload", {
    ...payload,
    name: file.name,
    bytes: file.size,
  });
  if (isDemo)
    return command("finish_upload", {
      ...payload,
      asset_id: reserved.id,
      text: await file.text(),
    });
  const body = new FormData();
  body.set("audit_id", String(payload.audit_id));
  body.set("revision", String(payload.revision));
  body.set("asset_id", String(reserved.id));
  body.set("file", file);
  const { error } = await supabase!.functions.invoke("api", { body });
  if (error) throw new Error("Upload failed. Retry or exclude the file.");
  return { id: reserved.id };
}
export async function previewAsset(payload: Record<string, unknown>) {
  if (isDemo) return "";
  const { data, error } = await supabase!.functions.invoke("api", {
    body: { action: "preview", payload },
  });
  if (error) throw new Error("Preview unavailable.");
  return data instanceof Blob ? URL.createObjectURL(data) : "";
}
export function downloadHtml(html: string, name: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_]/gi, "_")}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
