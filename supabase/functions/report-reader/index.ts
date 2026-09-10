import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  hashShareToken,
  sharePassword,
  shareToken,
  shareViewerUrl,
} from "../_shared/sharing.ts";

export async function handler(req: Request): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    Vary: "Origin",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  const unavailable = () => json({ error: "Report unavailable." }, 404);
  try {
    const origin = shareViewerUrl(Deno.env.get("OMA_REPORT_VIEWER_URL")).origin;
    if (req.headers.get("origin") !== origin) return unavailable();
    headers["Access-Control-Allow-Origin"] = origin;
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json({ error: "POST required." }, 405);
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return unavailable();
    // Bound streamed bodies even when Content-Length is absent or forged.
    let size = 0;
    const text = await new Response(
      req.body?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            size += chunk.byteLength;
            if (size > 2048) throw new Error("size");
            controller.enqueue(chunk);
          },
        }),
      ),
    ).text();
    const body = z
      .object({ token: shareToken, password: sharePassword.default("") })
      .strict()
      .parse(JSON.parse(text));
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        db: { schema: "api" },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await db.rpc("read_shared_report", {
      candidate: await hashShareToken(body.token),
      password: body.password,
    });
    if (error) return unavailable();
    if (data?.password_required === true)
      return json({ password_required: true }, 401);
    if (typeof data?.html !== "string") return unavailable();
    return json({ html: data.html });
  } catch {
    return unavailable();
  }
}
if (import.meta.main) Deno.serve(handler);
