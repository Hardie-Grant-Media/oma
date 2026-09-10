import assert from "node:assert/strict";
import { createHandler } from "../../supabase/functions/mcp/index.ts";
import {
  AccessError,
  validateClaims,
  authenticate,
  type Backend,
  type Config,
} from "../../supabase/functions/mcp/backend.ts";
import type { Snapshot } from "../../supabase/functions/_shared/domain.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const uid = "10000000-0000-4000-8000-000000000001",
  aid = "30000000-0000-4000-8000-000000000001";
const config: Config = {
  supabaseUrl: "http://127.0.0.1:55321",
  publicKey: "synthetic-public",
  resourceUrl: "http://127.0.0.1:55321/functions/v1/mcp",
  clientIds: ["dedicated-oma-client"],
  origins: ["http://127.0.0.1:5173"],
};
function backend(role = "admin") {
  const calls: { action: string; payload: Record<string, unknown> }[] = [];
  const state = {
    me: { id: uid, active: true, role },
    clients: [],
    audits: [
      {
        id: aid,
        client_id: uid,
        setup: { title: "Synthetic audit" },
        revision: 1,
      },
    ],
    members: [],
    assignments: [],
    evidence: [],
    revisions: [],
    jobs: [],
    feedback: [],
    ledger: [],
    usage: [],
  } as unknown as Snapshot;
  const value: Backend = {
    state,
    command: async (action, payload) => {
      calls.push({ action, payload });
      return { id: uid };
    },
    upload: async (body) => {
      assert.equal(await (body.get("file") as File).text(), "Real test bytes");
      return { uploaded: true };
    },
    preview: async () => ({ mime_type: "image/png", content_base64: "AA==" }),
  };
  return { value, calls };
}
function request(
  body: unknown,
  token = "synthetic",
  headers: Record<string, string> = {},
) {
  return new Request(config.resourceUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
Deno.test(
  "MCP discovery, auth challenge, denied origins, size limits and malformed requests",
  async () => {
    let authCalls = 0;
    const handler = createHandler({
      config: () => config,
      authenticate: async () => {
        authCalls++;
        return backend().value;
      },
    });
    const metadata = await handler(
      new Request(config.resourceUrl + "/.well-known/oauth-protected-resource"),
    );
    assert.equal(metadata.status, 200);
    assert.equal((await metadata.json()).resource, config.resourceUrl);
    const anonymous = await handler(request({}, ""));
    assert.equal(anonymous.status, 401);
    assert.match(
      anonymous.headers.get("www-authenticate")!,
      /resource_metadata=/,
    );
    await anonymous.body?.cancel();
    const origin = await handler(
      request({}, "synthetic", { origin: "https://evil.example" }),
    );
    assert.equal(origin.status, 403);
    await origin.body?.cancel();
    assert.equal(authCalls, 0);
    const large = await handler(
      request({}, "synthetic", { "content-length": "30000000" }),
    );
    assert.equal(large.status, 413);
    await large.body?.cancel();
    const batch = await handler(request([]));
    assert.equal(batch.status, 400);
    await batch.body?.cancel();
  },
);
Deno.test(
  "MCP SDK initializes and invokes tools, preserving backend validation and identity",
  async () => {
    const b = backend();
    let active = true;
    const handler = createHandler({
      config: () => config,
      authenticate: async () => {
        if (!active) throw new AccessError(403, "Removed member");
        return b.value;
      },
    });
    const client = new Client({ name: "synthetic-client", version: "1" });
    const transport = new StreamableHTTPClientTransport(
      new URL(config.resourceUrl),
      {
        requestInit: { headers: { authorization: "Bearer synthetic" } },
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          handler(new Request(input, init)),
      },
    );
    await client.connect(transport);
    try {
      const list = await client.listTools();
      assert(list.tools.length >= 30);
      assert(
        list.tools.find(
          (t: {
            name: string;
            annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean };
          }) => t.name === "oma_delete_audit",
        )?.annotations?.destructiveHint,
      );
      assert.equal(
        list.tools.find(
          (t: {
            name: string;
            annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean };
          }) => t.name === "oma_whoami",
        )?.annotations?.readOnlyHint,
        true,
      );
      const result = await client.callTool({
        name: "oma_create_client",
        arguments: { name: "Synthetic", actor: "forged" },
      });
      assert(!result.isError);
      assert.deepEqual(b.calls, [
        {
          action: "create_client",
          payload: { name: "Synthetic", context: "" },
        },
      ]);
      const bad = await client.callTool({
        name: "oma_set_audit_budget",
        arguments: { audit_id: aid, budget: 26 },
      });
      assert(bad.isError);
      assert.equal(b.calls.length, 1);
      const inaccessible = await client.callTool({
        name: "oma_get_audit",
        arguments: { audit_id: uid },
      });
      assert(inaccessible.isError);
      const upload = await client.callTool({
        name: "oma_upload_evidence",
        arguments: {
          audit_id: aid,
          revision: 1,
          channel: "Website",
          name: "test.txt",
          captured_at: "2026-09-10",
          content: "Real test bytes",
          encoding: "utf8",
        },
      });
      assert(!upload.isError, JSON.stringify(upload));
      assert(b.calls.some((c) => c.action === "reserve_upload"));
      active = false;
      const denied = await handler(
        request({ jsonrpc: "2.0", id: 20, method: "tools/list" }),
      );
      assert.equal(denied.status, 403);
      await denied.body?.cancel();
    } finally {
      await client.close();
    }
  },
);
Deno.test(
  "member tools hide administrator operations and no unknown tool reaches backend",
  async () => {
    const b = backend("member"),
      handler = createHandler({
        config: () => config,
        authenticate: async () => b.value,
      });
    const list = await (
      await handler(request({ jsonrpc: "2.0", id: 1, method: "tools/list" }))
    ).json();
    assert(
      !list.result.tools.some((t: { name: string }) =>
        ["oma_delete_audit", "oma_provision_staff", "oma_list_staff"].includes(
          t.name,
        ),
      ),
    );
    const denied = await (
      await handler(
        request({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "oma_delete_audit",
            arguments: { audit_id: aid, confirm: "Synthetic" },
          },
        }),
      )
    ).json();
    assert(denied.error || denied.result?.isError);
    assert.equal(b.calls.length, 0);
  },
);
Deno.test(
  "OAuth claims reject browser tokens, wrong clients, issuers, audiences, scopes and expiry",
  () => {
    const claims = {
      iss: config.supabaseUrl + "/auth/v1",
      aud: config.resourceUrl,
      role: "authenticated",
      sub: uid,
      session_id: uid,
      client_id: config.clientIds[0],
      scope: "email",
      exp: Date.now() / 1000 + 600,
    };
    validateClaims(claims, config);
    for (const patch of [
      { client_id: undefined },
      { session_id: undefined },
      { aud: "authenticated" },
      { client_id: "another-client" },
      { iss: "https://evil.example" },
      { aud: "another-api" },
      { scope: "profile" },
      { exp: 1 },
      { role: "service_role" },
    ])
      assert.throws(
        () => validateClaims({ ...claims, ...patch }, config),
        AccessError,
      );
  },
);
Deno.test(
  "real JWT signature validation, current grants, membership and upstream API failures",
  async () => {
    const key = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = {
      ...(await crypto.subtle.exportKey("jwk", key.publicKey)),
      kid: "test-signing-key",
      alg: "ES256",
      use: "sig",
    };
    const b64 = (value: unknown) =>
      btoa(JSON.stringify(value))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const payload = {
      iss: config.supabaseUrl + "/auth/v1",
      aud: config.resourceUrl,
      role: "authenticated",
      sub: uid,
      session_id: uid,
      client_id: config.clientIds[0],
      scope: "email",
      exp: Math.floor(Date.now() / 1000) + 600,
    };
    const input = `${b64({ alg: "ES256", kid: jwk.kid })}.${b64(payload)}`;
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key.privateKey,
        new TextEncoder().encode(input),
      ),
    );
    const token =
      input +
      "." +
      btoa(String.fromCharCode(...signature))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const original = globalThis.fetch;
    let revoked = false,
      removed = false;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("jwks.json")) return Response.json({ keys: [jwk] });
      if (url.endsWith("/user"))
        return Response.json({ id: uid, email_confirmed_at: "2026-01-01" });
      if (url.endsWith("/user/oauth/grants"))
        return Response.json(
          revoked ? [] : [{ client: { id: config.clientIds[0] } }],
        );
      if (url.endsWith("/rpc/snapshot"))
        return Response.json({
          ...backend().value.state,
          me: { id: uid, active: !removed, role: "admin" },
        });
      if (url.endsWith("/functions/v1/api"))
        return Response.json(
          { error: "Only approved reports can be shared." },
          { status: 400 },
        );
      throw new Error("Unexpected URL " + url);
    };
    try {
      const b = await authenticate(token, config);
      await assert.rejects(
        () => b.command("share_create", {}),
        /Only approved/,
      );
      await assert.rejects(
        () => authenticate(token.slice(0, -8) + "tampered", config),
        AccessError,
      );
      revoked = true;
      await assert.rejects(() => authenticate(token, config), AccessError);
      revoked = false;
      removed = true;
      await assert.rejects(() => authenticate(token, config), AccessError);
    } finally {
      globalThis.fetch = original;
    }
  },
);
