import assert from "node:assert/strict";
import { handler as reader } from "../../supabase/functions/report-reader/index.ts";
import { handler as api } from "../../supabase/functions/api/index.ts";
import { hashShareToken } from "../../supabase/functions/_shared/sharing.ts";
const token = "a".repeat(43),
  origin = "http://127.0.0.1:5180",
  id = "11000000-0000-4000-8000-000000000001",
  aid = "33000000-0000-4000-8000-000000000001";
for (const [k, v] of Object.entries({
  SUPABASE_URL: "http://127.0.0.1:55321",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
  SUPABASE_ANON_KEY: "synthetic-anon",
  OMA_REPORT_VIEWER_URL: origin,
  APP_ORIGINS: "http://127.0.0.1:5173",
}))
  Deno.env.set(k, v);
async function mock<T>(
  response: unknown,
  fn: (calls: Record<string, unknown>[]) => Promise<T>,
) {
  const original = globalThis.fetch,
    calls: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user"))
      return Response.json({ id, email_confirmed_at: "2026-01-01" });
    if (url.endsWith("/rpc/snapshot"))
      return Response.json({
        me: { id, active: true, role: "member" },
        audits: [{ id: aid, status: "Approved" }],
        revisions: [],
        evidence: [],
      });
    calls.push(JSON.parse(String(init?.body)));
    return Response.json(response);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}
function read(body: unknown, extra: Record<string, string> = {}) {
  return reader(
    new Request("http://local/report-reader", {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...extra },
      body: JSON.stringify(body),
    }),
  );
}
Deno.test(
  "reader hashes token and returns only report HTML without caching",
  () =>
    mock({ html: "<h1>Approved</h1>", internal: "secret" }, async (calls) => {
      const res = await read({ token });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { html: "<h1>Approved</h1>" });
      assert.match(res.headers.get("cache-control")!, /no-store/);
      assert.match(res.headers.get("x-robots-tag")!, /noindex/);
      assert.equal(calls[0].candidate, await hashShareToken(token));
      assert(!JSON.stringify(calls).includes(token));
    }),
);
Deno.test(
  "reader rejects wrong origin and malformed or oversized credentials without database work",
  () =>
    mock({}, async (calls) => {
      for (const res of [
        await read({ token }, { origin: "https://untrusted.example" }),
        await read({ token: "short" }),
        await read({ token, password: "x".repeat(3000) }),
      ])
        assert.equal(res.status, 404);
      assert.equal(calls.length, 0);
    }),
);
Deno.test(
  "reader uses uniform unavailable response and exposes password prompt only for valid capability",
  async () => {
    await mock({ unavailable: true }, async () =>
      assert.deepEqual(await (await read({ token })).json(), {
        error: "Report unavailable.",
      }),
    );
    await mock({ password_required: true }, async () => {
      const res = await read({ token });
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { password_required: true });
    });
  },
);
Deno.test(
  "sharing API uses authenticated actor and hashes capability before RPC",
  () =>
    mock({ id: "share", revoked: false }, async (calls) => {
      const res = await api(
        new Request("http://local/api", {
          method: "POST",
          headers: {
            authorization: "Bearer synthetic",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "share_create",
            payload: {
              audit_id: aid,
              version: 1,
              request_key: crypto.randomUUID(),
              token,
              password: "password-test",
              actor: "attacker",
            },
          }),
        }),
      );
      assert.equal(res.status, 200);
      const result = await res.json();
      assert.equal(new URL(result.url).hash, "#" + token);
      assert.equal(calls[0].actor, id);
      const p = calls[0].payload as Record<string, unknown>;
      assert.equal(p.token_hash, await hashShareToken(token));
      assert.equal(p.token, undefined);
      assert.equal(p.actor, undefined);
    }),
);
Deno.test("sharing API denies unknown audit before privileged RPC", () =>
  mock({}, async (calls) => {
    const res = await api(
      new Request("http://local/api", {
        method: "POST",
        headers: {
          authorization: "Bearer synthetic",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "share_list",
          payload: { audit_id: crypto.randomUUID() },
        }),
      }),
    );
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  }),
);
