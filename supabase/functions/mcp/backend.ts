import { createClient } from "@supabase/supabase-js";
import type { Snapshot } from "../_shared/domain.ts";

export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Config = {
  supabaseUrl: string;
  publicKey: string;
  resourceUrl: string;
  clientIds: string[];
  origins: string[];
};
export type Backend = {
  state: Snapshot;
  command: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  upload: (body: FormData) => Promise<Record<string, unknown>>;
  preview: (
    payload: Record<string, unknown>,
  ) => Promise<{ mime_type: string; content_base64: string }>;
};
export function validateClaims(
  claims: Record<string, unknown>,
  config: Config,
) {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  // The Auth hook binds tokens to this MCP resource. A dedicated registered
  // client is also mandatory; browser and unrelated OAuth tokens fail.
  if (
    claims.iss !== `${config.supabaseUrl}/auth/v1` ||
    !audiences.includes(config.resourceUrl) ||
    claims.role !== "authenticated" ||
    typeof claims.exp !== "number" ||
    claims.exp <= Date.now() / 1000 ||
    typeof claims.sub !== "string" ||
    typeof claims.session_id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(claims.session_id) ||
    typeof claims.client_id !== "string" ||
    !config.clientIds.includes(claims.client_id) ||
    typeof claims.scope !== "string" ||
    !claims.scope.split(" ").includes("email")
  ) {
    throw new AccessError(401, "Reconnect OMA to continue.");
  }
}
export async function authenticate(
  token: string,
  config: Config,
): Promise<Backend> {
  const client = createClient(config.supabaseUrl, config.publicKey, {
    db: { schema: "api" },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data) throw new AccessError(401, "Reconnect OMA to continue.");
  validateClaims(data.claims, config);
  const { data: identity, error: identityError } =
    await client.auth.getUser(token);
  if (
    identityError ||
    !identity.user?.email_confirmed_at ||
    identity.user.id !== data.claims.sub
  )
    throw new AccessError(401, "Reconnect OMA to continue.");
  // Read the current grant on every request, not just its cached JWT claims.
  const grantsResponse = await fetch(
    `${config.supabaseUrl}/auth/v1/user/oauth/grants`,
    {
      headers: { Authorization: `Bearer ${token}`, apikey: config.publicKey },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!grantsResponse.ok)
    throw new AccessError(401, "Reconnect OMA to continue.");
  const grants = await grantsResponse.json();
  if (
    !Array.isArray(grants) ||
    !grants.some((g) => g.client?.id === data.claims.client_id)
  )
    throw new AccessError(401, "OMA connection has been revoked.");
  const { data: state, error: stateError } = await client.rpc("snapshot");
  if (stateError || !state?.me?.active || state.me.id !== identity.user.id)
    throw new AccessError(403, "OMA staff access is required.");
  async function call(body: string | FormData, binary = false) {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/api`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(55000),
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: config.publicKey,
        ...(typeof body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body,
    });
    if (binary && response.ok) {
      if (
        !/^(application\/pdf|image\/(png|jpeg))(;|$)/.test(
          response.headers.get("content-type") ?? "",
        )
      )
        throw new Error(
          "Use list_evidence for this file’s extracted text; binary preview supports PDF and images.",
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        mime_type:
          response.headers.get("content-type") ?? "application/octet-stream",
        content_base64: encodeBase64(bytes),
      };
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error)
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "OMA request failed. Check the audit before retrying.",
      );
    return result;
  }
  return {
    state,
    command: (action, payload) => call(JSON.stringify({ action, payload })),
    upload: (body) => call(body),
    preview: (payload) =>
      call(JSON.stringify({ action: "preview", payload }), true),
  };
}
export function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
