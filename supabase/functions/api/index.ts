import { hashShareToken, shareViewerUrl } from "../_shared/sharing.ts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  assessmentSchema,
  canApprove,
  extractionSchema,
  reconcile,
  reportSchema,
  validateAssessment,
  validateReport,
  validateUpload,
  type Snapshot,
} from "../_shared/domain.ts";
import { renderReport } from "../_shared/report.ts";
import { verifyBytes } from "../_shared/extract.ts";
import { base, schemas as commandSchemas } from "../_shared/commands.ts";
const schemas: Record<string, z.ZodType> = commandSchemas;
function boundedBody(req: Request, limit: number) {
  let bytes = 0;
  return new Response(
    req.body?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > limit) throw new Error("Request too large.");
          controller.enqueue(chunk);
        },
      }),
    ),
    {
      headers: {
        "Content-Type": req.headers.get("content-type") ?? "application/json",
      },
    },
  );
}
export async function handler(req: Request): Promise<Response> {
  const allowed = (Deno.env.get("APP_ORIGINS") ?? "http://127.0.0.1:5173")
    .split(",")
    .map((x) => x.trim());
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && allowed.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin))
    return json({ error: "Origin denied." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Sign in." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!,
      anon = Deno.env.get("SUPABASE_ANON_KEY")!,
      serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const user = createClient(url, anon, {
      db: { schema: "api" },
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: authError } = await user.auth.getUser(
      auth.slice(7),
    );
    if (authError || !identity.user?.email_confirmed_at)
      return json({ error: "Sign in." }, 401);
    const { data: raw, error: accessError } = await user.rpc("snapshot");
    if (accessError || !raw?.me?.active)
      return json({ error: "Access denied." }, 403);
    const state = raw as Snapshot;
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > 21 * 1024 * 1024)
        return json({ error: "File too large." }, 413);
      const body = await boundedBody(req, 21 * 1024 * 1024).formData();
      const p = base.extend({ asset_id: z.string().uuid() }).parse({
        audit_id: body.get("audit_id"),
        revision: Number(body.get("revision")),
        asset_id: body.get("asset_id"),
      });
      const asset = state.evidence.find(
          (e) => e.id === p.asset_id && e.audit_id === p.audit_id,
        ),
        a = state.audits.find((a) => a.id === p.audit_id),
        file = body.get("file");
      if (
        !asset ||
        !a ||
        !(file instanceof File) ||
        file.size !== Number(asset.bytes)
      )
        throw new Error("Invalid upload.");
      const admin = createClient(url, serviceKey, {
        db: { schema: "api" },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const call = async (action: string) => {
        const result = await admin.rpc("command", {
          actor: identity.user!.id,
          action,
          payload: p,
        });
        if (result.error) throw new Error(result.error.message);
      };
      await call("begin_upload");
      const bytes = new Uint8Array(await file.arrayBuffer());
      verifyBytes(bytes, asset.mime);
      const { error } = await admin.storage
        .from("evidence")
        .upload(asset.path, bytes, { contentType: asset.mime, upsert: false });
      if (error) throw new Error("Upload failed. Exclude and retry.");
      await call("finish_upload");
      return json({ id: asset.id });
    }
    if (Number(req.headers.get("content-length") ?? 0) > 1048576)
      return json({ error: "Request too large." }, 413);
    const input = await boundedBody(req, 1048576).text();
    if (input.length > 1048576)
      return json({ error: "Request too large." }, 413);
    const parsed = z
      .object({
        action: z.string(),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(JSON.parse(input));
    const { action } = parsed;
    if (!schemas[action]) return json({ error: "Unknown action." }, 400);
    const p = schemas[action].parse(parsed.payload) as Record<string, unknown>;
    const admin = createClient(url, serviceKey, {
      db: { schema: "api" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpc = async (action: string, payload: Record<string, unknown>) => {
      const { data, error } = await admin.rpc("command", {
        actor: identity.user!.id,
        action,
        payload,
      });
      if (error) throw new Error(error.message);
      return data;
    };
    if (
      [
        "create_client",
        "provision",
        "member",
        "assign",
        "budget",
        "delete",
        "recover",
      ].includes(action) &&
      state.me.role !== "admin"
    )
      return json({ error: "Admin required." }, 403);
    if (["share_create", "share_list", "share_revoke"].includes(action)) {
      if (
        !state.audits.some(
          (a) => a.id === p.audit_id && a.status !== "Deleting",
        )
      )
        return json({ error: "Access denied." }, 403);
      const viewer =
        action === "share_create"
          ? shareViewerUrl(Deno.env.get("OMA_REPORT_VIEWER_URL"))
          : null;
      const { token, ...sharePayload } = p;
      if (action === "share_create")
        sharePayload.token_hash = await hashShareToken(String(token));
      const { data, error } = await admin.rpc("share_command", {
        actor: identity.user.id,
        action,
        payload: sharePayload,
      });
      if (error)
        return json(
          {
            error:
              "Sharing failed. Check access, approval, password and expiry, then retry.",
          },
          400,
        );
      if (viewer && !data.revoked) {
        viewer.hash = String(token);
        return json({ ...data, url: viewer.toString() });
      }
      return json(data);
    }
    if (action === "provision") {
      const { data, error } = await admin.auth.admin.createUser({
        email: String(p.email),
        email_confirm: true,
        user_metadata: { name: p.name },
      });
      if (error)
        throw new Error(
          "Member could not be added. Check for an existing account.",
        );
      try {
        await rpc("member", {
          ...p,
          user_id: data.user.id,
          role: "member",
          active: true,
        });
      } catch (e) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw e;
      }
      return json({ id: data.user.id });
    }
    const a = state.audits.find((a) => a.id === p.audit_id),
      r = state.revisions.find(
        (r) => r.audit_id === a?.id && r.version === a?.revision,
      ),
      evidence = state.evidence.filter((e) => e.audit_id === a?.id);
    if ("audit_id" in p && !a) return json({ error: "Access denied." }, 403);
    if (a && "revision" in p && p.revision !== a.revision)
      throw new Error("Audit changed. Refresh.");
    if (action === "reserve_upload") {
      p.mime = validateUpload(
        String(p.name),
        Number(p.bytes),
        evidence.reduce((n, e) => n + Number(e.bytes), 0),
        evidence.length,
      );
      return json(await rpc(action, p));
    }
    if (["finish_upload", "preview"].includes(action)) {
      const asset = evidence.find((e) => e.id === p.asset_id);
      if (!asset) throw new Error("File not found.");
      if (action === "preview") {
        if (
          !["application/pdf", "image/png", "image/jpeg"].includes(asset.mime)
        )
          return json({ url: null });
        // Fetch through an authenticated proxy on every request. Revocation does not wait for a signed URL to expire.
        const { data, error } = await user.storage
          .from("evidence")
          .download(asset.path);
        if (error || !data) throw new Error("Preview unavailable.");
        return new Response(data, {
          headers: {
            ...headers,
            "Content-Type": asset.mime,
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        });
      }
      const { data, error } = await admin.storage
        .from("evidence")
        .download(asset.path);
      if (error || !data || data.size !== Number(asset.bytes))
        throw new Error("File size differs. Exclude and upload again.");
      verifyBytes(new Uint8Array(await data.arrayBuffer()), asset.mime);
    }
    if (action === "verify_evidence") {
      const obs = extractionSchema.parse(p).observations,
        asset = evidence.find((e) => e.id === p.asset_id);
      if (!asset) throw new Error("File not found.");
      if (
        obs.some((o) => !o.verified) ||
        new Set(obs.map((o) => o.id)).size !== obs.length ||
        obs.some((o) => !asset.observations.some((old) => old.id === o.id))
      )
        throw new Error("Verify every source. Keep its reference ID.");
    }
    if (
      action === "assess" &&
      a &&
      Object.values(a.setup).some((v) => v === "To confirm")
    )
      throw new Error("Complete setup first.");
    if (
      action === "exclude" &&
      p.channel &&
      !a!.setup.channels.includes(p.channel as never)
    )
      throw new Error("Channel not in scope.");
    if (action === "save_review") {
      validateAssessment(
        assessmentSchema.parse(p.assessment),
        evidence,
        a!.setup.channels,
      );
      validateReport(reportSchema.parse(p.report), evidence);
      const ids = new Set(
        evidence
          .filter((e) => e.status === "Verified")
          .flatMap((e) =>
            e.observations.filter((o) => o.verified).map((o) => o.id),
          ),
      );
      if ((p.evidence_ids as string[]).some((id) => !ids.has(id)))
        throw new Error("Correction has an unverified source.");
    }
    if (action === "approve") {
      canApprove(a!, r!, state.me, evidence);
      p.reconciliation = reconcile(r!.assessment!, a!.setup.pov_score);
      p.html = renderReport(
        a!,
        {
          ...r!,
          approved_at: new Date().toISOString(),
          approved_by: state.me.id,
        },
        evidence,
        state.clients.find((c) => c.id === a!.client_id)!.name,
      );
    }
    if (action === "recover") {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new Error("Configure OpenAI first.");
      const res = await fetch(
        `https://api.openai.com/v1/responses/${p.response_id}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) throw new Error("Provider response unavailable.");
      const response = await res.json();
      if (
        response.metadata?.job_id !== p.job_id ||
        response.metadata?.audit_id !== p.audit_id
      )
        throw new Error("Response belongs to another job.");
    }
    return json(await rpc(action, p));
  } catch (e) {
    return json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues[0]?.message
            : e instanceof SyntaxError
              ? "Invalid request."
              : (e as Error).message,
      },
      400,
    );
  }
}
if (import.meta.main) Deno.serve(handler);
