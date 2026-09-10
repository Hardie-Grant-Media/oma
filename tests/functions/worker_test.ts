import assert from "node:assert/strict";
import { handler } from "../../supabase/functions/worker/index.ts";
import { MAX_CALL_USD } from "../../supabase/functions/_shared/provider.ts";
const environment = {
  SUPABASE_URL: "http://127.0.0.1:55321",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
  OMA_WORKER_TOKEN: "synthetic-worker-token",
  OPENAI_API_KEY: "synthetic-provider-key",
  OMA_AI_ENABLED: "true",
  OMA_PROVIDER_RETENTION_ACK: "true",
};
for (const [key, value] of Object.entries(environment))
  Deno.env.set(key, value);
for (const authorized of [true, false, null]) {
  Deno.test(`Vault worker authentication: ${authorized}`, async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    Deno.env.delete("OMA_WORKER_TOKEN");
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/rpc/worker_authorized"))
        return authorized === null
          ? Response.json({ message: "Unavailable" }, { status: 503 })
          : Response.json(authorized);
      if (url.endsWith("/rpc/worker")) return Response.json([]);
      throw new Error("Unexpected request");
    };
    try {
      const result = await handler(
        new Request("http://local/worker", {
          method: "POST",
          headers: { Authorization: `Bearer ${"a".repeat(64)}` },
        }),
      );
      assert.equal(result.status, authorized === true ? 200 : 401);
      assert.equal(
        calls.some((url) => url.endsWith("/rpc/worker")),
        authorized === true,
      );
    } finally {
      globalThis.fetch = original;
      Deno.env.set("OMA_WORKER_TOKEN", environment.OMA_WORKER_TOKEN);
    }
  });
}
type Event = { action: string; payload: Record<string, unknown> };
async function scenario(
  options: {
    status?: string;
    response_id?: string;
    providerStatus?: number;
    providerBody?: unknown;
    stage?: string;
    unresolved?: boolean;
    reserve?: boolean;
    throwSubmit?: boolean;
  } = {},
) {
  const events: Event[] = [],
    calls: { url: string; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  const job = {
    id: "job-1",
    audit_id: "audit-1",
    asset_id: options.stage === "extraction" ? "pdf-1" : null,
    stage: options.stage ?? "calibration",
    status: options.response_id ? "Waiting" : "Running",
    response_id: options.response_id ?? null,
    attempts: 0,
    reservation: options.response_id ? MAX_CALL_USD : 0,
  };
  const audit = {
    id: "audit-1",
    title: "Synthetic",
    budget_usd: 25,
    revision: 1,
    status: options.status ?? "Assessing",
    setup: {
      audience: "Readers",
      category: "Test",
      channels: ["Website"],
      period_start: "2026-01-01",
      period_end: "2026-02-01",
      pov_score: 4.9,
      pov_rationale: "SECRET_POV",
    },
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url, body });
    if (url.endsWith("/rpc/worker")) {
      events.push(body);
      let data: unknown = {};
      if (body.action === "claim") data = [job];
      if (body.action === "context")
        data = {
          job,
          audit,
          revision: { calibration: null },
          evidence:
            options.stage === "extraction"
              ? [
                  {
                    id: "pdf-1",
                    mime: "application/pdf",
                    path: "test/file",
                    name: "fixture.pdf",
                    source: "Synthetic",
                    channel: "Website",
                    captured_at: "2026-01-01",
                  },
                ]
              : [],
          responses: [],
          provider_files: [],
          unresolved: options.unresolved ?? false,
          upload_deadline: null,
        };
      if (body.action === "reserve")
        data = { allowed: options.reserve ?? true };
      return Response.json(data);
    }
    if (url.endsWith("/responses/input_tokens"))
      return Response.json({ input_tokens: 2000 });
    if (url.includes("/storage/v1/object/") && options.stage === "extraction")
      return new Response("%PDF-1.7\nSynthetic fixture\n%%EOF", {
        headers: { "Content-Type": "application/pdf" },
      });
    if (url.endsWith("/responses") && options.throwSubmit)
      throw new TypeError("Network lost");
    if (url.startsWith("https://api.openai.com/"))
      return Response.json(options.providerBody ?? { id: "resp_synthetic" }, {
        status: options.providerStatus ?? 200,
      });
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const response = await handler(
      new Request("http://local/worker", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic-worker-token" },
      }),
    );
    assert.equal(response.status, 200);
    return { events, calls };
  } finally {
    globalThis.fetch = original;
  }
}
Deno.test(
  "reserve precedes background submission; POV never leaves server",
  async () => {
    const { events, calls } = await scenario();
    assert(events.find((e) => e.action === "reserve"));
    assert(events.find((e) => e.action === "submitted"));
    const body = calls.find((c) => c.url.endsWith("/responses"))!.body;
    assert.equal(body.background, true);
    assert.equal(body.max_output_tokens, 8192);
    assert(!JSON.stringify(body).includes("SECRET_POV"));
    assert(!JSON.stringify(body).includes("pov_score"));
    assert.equal(
      events.find((e) => e.action === "reserve")!.payload.cost,
      MAX_CALL_USD,
    );
  },
);
Deno.test("budget rejection prevents provider submission", async () => {
  const { calls } = await scenario({ reserve: false });
  assert(!calls.some((c) => c.url.endsWith("/responses")));
});
Deno.test(
  "PDF extraction explicitly requests high-detail page images",
  async () => {
    const { calls } = await scenario({ stage: "extraction" });
    const body = calls.find((c) => c.url.endsWith("/responses"))!.body;
    const input = body.input as {
      content: { type: string; detail?: string }[];
    }[];
    assert.equal(
      input[0].content.find((c) => c.type === "input_file")?.detail,
      "high",
    );
    assert(String(body.instructions).includes("Do not score, calibrate"));
  },
);
Deno.test(
  "canary scope is one audit with a five-dollar reservation cap",
  async () => {
    Deno.env.set("OMA_AI_ENABLED", "false");
    Deno.env.set("OMA_CANARY_AUDIT_ID", "audit-1");
    try {
      const allowed = await scenario();
      assert.equal(
        allowed.events.find((e) => e.action === "reserve")?.payload.budget_cap,
        5,
      );
      Deno.env.set("OMA_CANARY_AUDIT_ID", "another-audit");
      const denied = await scenario();
      assert(
        !denied.calls.some((c) => c.url.startsWith("https://api.openai.com/")),
      );
    } finally {
      Deno.env.delete("OMA_CANARY_AUDIT_ID");
      Deno.env.set("OMA_AI_ENABLED", "true");
    }
  },
);
Deno.test(
  "ambiguous network submission stays uncertain; never immediately retried",
  async () => {
    const { events, calls } = await scenario({ throwSubmit: true });
    assert.equal(calls.filter((c) => c.url.endsWith("/responses")).length, 1);
    assert.equal(events.at(-1)?.payload.uncertain, true);
  },
);
Deno.test("HTTP 5xx is uncertain, 429 is retryable", async () => {
  const uncertain = await scenario({ providerStatus: 500 });
  assert.equal(uncertain.events.at(-1)?.payload.uncertain, true);
  const retry = await scenario({ providerStatus: 429 });
  assert.equal(retry.events.at(-1)?.payload.retryable, true);
  assert.equal(retry.events.at(-1)?.payload.uncertain, false);
});
Deno.test("existing responses are polled, not recreated", async () => {
  const { events, calls } = await scenario({
    response_id: "resp_existing",
    providerBody: { id: "resp_existing", status: "in_progress" },
  });
  assert.equal(events.at(-1)?.action, "waiting");
  assert(!calls.some((c) => c.url.endsWith("/responses")));
});
Deno.test("incomplete output fails without invented assessment", async () => {
  const { events } = await scenario({
    response_id: "resp_existing",
    providerBody: {
      id: "resp_existing",
      status: "incomplete",
      usage: { input_tokens: 1000, output_tokens: 8192 },
    },
  });
  assert.equal(events.at(-1)?.action, "error");
  assert.equal(events.at(-1)?.payload.uncertain, false);
});
Deno.test(
  "completed insufficient evidence returns to evidence review",
  async () => {
    const { events } = await scenario({
      response_id: "resp_existing",
      providerBody: {
        id: "resp_existing",
        status: "completed",
        usage: { input_tokens: 1000, output_tokens: 100 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  result: null,
                  needs_evidence: ["Supply dated examples."],
                }),
              },
            ],
          },
        ],
      },
    });
    assert.equal(events.at(-1)?.action, "insufficient");
  },
);
Deno.test("deletion waits for uncertain submissions", async () => {
  const { events, calls } = await scenario({
    stage: "deletion",
    status: "Deleting",
    unresolved: true,
  });
  assert.equal(events.at(-1)?.action, "defer");
  assert(!calls.some((c) => c.url.startsWith("https://api.openai.com")));
});
Deno.test("deletion completion invokes purge only after cleanup", async () => {
  const { events } = await scenario({ stage: "deletion", status: "Deleting" });
  assert.equal(events.at(-1)?.action, "purged");
});
Deno.test("worker rejects missing secret", async () => {
  const response = await handler(
    new Request("http://local/worker", { method: "POST" }),
  );
  assert.equal(response.status, 401);
});
