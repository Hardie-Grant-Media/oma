import assert from "node:assert/strict";
import { handler } from "../../supabase/functions/api/index.ts";
const id = "10000000-0000-4000-8000-000000000001";
for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://127.0.0.1:55321",
  SUPABASE_ANON_KEY: "synthetic-anon",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
  APP_ORIGINS: "http://127.0.0.1:5173",
}))
  Deno.env.set(key, value);
async function invoke(
  action: string,
  payload: Record<string, unknown>,
  options: {
    active?: boolean;
    role?: string;
    verified?: boolean;
    origin?: string;
  } = {},
) {
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user"))
      return Response.json({
        id,
        email: "synthetic@example.test",
        email_confirmed_at:
          options.verified === false ? null : "2026-01-01T00:00:00Z",
      });
    if (url.endsWith("/rpc/snapshot"))
      return Response.json({
        me: {
          id,
          name: "Test",
          email: "synthetic@example.test",
          active: options.active ?? true,
          role: options.role ?? "member",
        },
        audits: [],
        revisions: [],
        evidence: [],
        clients: [],
      });
    if (url.endsWith("/rpc/command")) {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({ id: "created" });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const res = await handler(
      new Request("http://local/api", {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-token",
          "Content-Type": "application/json",
          Origin: options.origin ?? "http://127.0.0.1:5173",
        },
        body: JSON.stringify({ action, payload, actor: "forged" }),
      }),
    );
    return { status: res.status, data: await res.json(), calls };
  } finally {
    globalThis.fetch = original;
  }
}
Deno.test("anonymous API calls fail closed", async () => {
  assert.equal(
    (await handler(new Request("http://local/api", { method: "POST" }))).status,
    401,
  );
});
Deno.test("inactive or unverified membership is denied", async () => {
  assert.equal(
    (await invoke("create_client", { name: "Test" }, { active: false })).status,
    403,
  );
  assert.equal(
    (await invoke("create_client", { name: "Test" }, { verified: false }))
      .status,
    401,
  );
});
Deno.test("member cannot provision or administer clients", async () => {
  assert.equal((await invoke("create_client", { name: "Test" })).status, 403);
  assert.equal(
    (await invoke("provision", { email: "new@example.test", name: "New" }))
      .status,
    403,
  );
});
Deno.test(
  "server supplies the authenticated actor; ignores caller actor",
  async () => {
    const result = await invoke(
      "create_client",
      { name: "Test", actor: "forged" },
      { role: "admin" },
    );
    assert.equal(result.status, 200);
    assert.equal(result.calls[0].actor, id);
    assert(!JSON.stringify(result.calls).includes("forged"));
  },
);
Deno.test(
  "cross-client audit operations never reach privileged RPC",
  async () => {
    const result = await invoke("feedback", {
      audit_id: "30000000-0000-4000-8000-000000000001",
      note: "Test",
    });
    assert.equal(result.status, 403);
    assert.equal(result.calls.length, 0);
  },
);
Deno.test("unexpected origins are rejected", async () => {
  const result = await invoke(
    "create_client",
    { name: "Test" },
    { role: "admin", origin: "https://untrusted.test" },
  );
  assert.equal(result.status, 403);
  assert.equal(result.calls.length, 0);
});
Deno.test("invalid budgets and malformed IDs are rejected", async () => {
  assert.equal(
    (
      await invoke(
        "budget",
        { audit_id: "30000000-0000-4000-8000-000000000001", budget: 26 },
        { role: "admin" },
      )
    ).status,
    400,
  );
  assert.equal(
    (await invoke("feedback", { audit_id: "bad", note: "Test" })).status,
    400,
  );
});
