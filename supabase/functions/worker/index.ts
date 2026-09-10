import { createClient } from "@supabase/supabase-js";
import {
  assessmentSchema,
  extractionSchema,
  reportSchema,
  PROMPT_VERSION,
  validateAssessment,
  validateReport,
  type Audit,
  type Evidence,
  type Revision,
} from "../_shared/domain.ts";
import { textEvidence, verifyBytes } from "../_shared/extract.ts";
import { promptInput, EXTRACTION_RULES } from "../_shared/prompts.ts";
import {
  MAX_CALL_USD,
  MAX_INPUT,
  outputSchema,
  outputText,
  requestBody,
  usageCost,
  type Stage,
} from "../_shared/provider.ts";
type Job = {
  id: string;
  audit_id: string;
  asset_id: string | null;
  stage: Stage | "deletion";
  status: string;
  reservation: number;
  response_id: string | null;
  attempts: number;
};
type Context = {
  job: Job;
  audit: Audit;
  revision: Revision;
  evidence: Evidence[];
  provider_files: string[];
  responses: string[];
  unresolved: boolean;
  upload_deadline: string | null;
};
type ProviderResponse = {
  id: string;
  status: string;
  usage?: { input_tokens: number; output_tokens: number };
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  error?: { message: string };
};
const base64 = (bytes: Uint8Array) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 16384)
    value += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(value);
};
export async function handler(req: Request) {
  const token = Deno.env.get("OMA_WORKER_TOKEN");
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 263)
    return new Response("Denied", { status: 401 });
  if (token && authorization !== `Bearer ${token}`)
    return new Response("Denied", { status: 401 });
  if (req.method !== "POST")
    return new Response("POST required", { status: 405 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      db: { schema: "api" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  if (!token) {
    // Hosted mode checks the shared Vault credential without exposing it.
    const { data, error } = await db.rpc("worker_authorized", {
      candidate: authorization.slice(7),
    });
    if (error || data !== true) return new Response("Denied", { status: 401 });
  }
  const rpc = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc("worker", { action, payload });
    if (error) throw new Error(error.message);
    return data;
  };
  const key = Deno.env.get("OPENAI_API_KEY");
  const provider = async (
    path: string,
    method = "GET",
    body?: unknown,
    requestId?: string,
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      return await fetch(`https://api.openai.com/v1/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(requestId ? { "X-Client-Request-Id": requestId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
  const jobs = (await rpc("claim")) as Job[];
  await Promise.all(
    jobs.map(async (claimed) => {
      let c: Context | null = null,
        submitted = false,
        used = 0;
      const call = (action: string, p: Record<string, unknown> = {}) =>
        rpc(action, { ...p, job_id: claimed.id });
      try {
        c = (await call("context")) as Context | null;
        if (!c) return;
        const { job, audit, evidence, revision } = c;
        if (job.stage === "deletion") {
          if (
            c.unresolved ||
            (c.upload_deadline && Date.parse(c.upload_deadline) > Date.now())
          ) {
            await call("defer", {
              error: c.unresolved
                ? "Resolve uncertain submissions before deletion."
                : "Waiting for uploads to finish.",
            });
            return;
          }
          if ((c.responses.length || c.provider_files.length) && !key) {
            await call("defer", {
              error: "OpenAI credentials required for deletion.",
            });
            return;
          }
          for (const id of c.responses) {
            const res = await provider(`responses/${id}`);
            if (res.status !== 404) {
              if (!res.ok) throw new Error("Provider cleanup failed.");
              const result = (await res.json()) as ProviderResponse;
              if (["queued", "in_progress"].includes(result.status)) {
                const cancel = await provider(`responses/${id}/cancel`, "POST");
                if (!cancel.ok)
                  throw new Error("Provider cancellation pending.");
              }
              const del = await provider(`responses/${id}`, "DELETE");
              if (!del.ok && del.status !== 404)
                throw new Error("Provider deletion failed.");
            }
          }
          for (const id of c.provider_files) {
            const del = await provider(`files/${id}`, "DELETE");
            if (!del.ok && del.status !== 404)
              throw new Error("Provider file deletion failed.");
          }
          const paths = evidence.filter((e) => e.bytes > 0).map((e) => e.path);
          if (paths.length) {
            const { error } = await db.storage.from("evidence").remove(paths);
            if (error) throw new Error("Storage deletion failed.");
          }
          await call("purged");
          return;
        }
        const canary = Deno.env.get("OMA_CANARY_AUDIT_ID") === audit.id;
        if (
          !key ||
          (!canary && Deno.env.get("OMA_AI_ENABLED") !== "true") ||
          Deno.env.get("OMA_PROVIDER_RETENTION_ACK") !== "true"
        ) {
          await call("error", {
            error: "Configure OpenAI and confirm retention settings.",
            retryable: false,
            uncertain: false,
            cost: 0,
          });
          return;
        }
        if (job.response_id) {
          const cancelling =
            job.status === "Cancel pending" ||
            ["Cancelled", "Deleting"].includes(audit.status);
          const res = await provider(`responses/${job.response_id}`);
          if (!res.ok) {
            await call("waiting");
            return;
          }
          const response = (await res.json()) as ProviderResponse;
          used = usageCost(response.usage, Number(job.reservation));
          if (cancelling) {
            if (["queued", "in_progress"].includes(response.status)) {
              const cancel = await provider(
                `responses/${job.response_id}/cancel`,
                "POST",
              );
              if (!cancel.ok) {
                await call("waiting");
                return;
              }
              const stopped = (await cancel.json()) as ProviderResponse;
              used = usageCost(stopped.usage, Number(job.reservation));
            }
            await call("cancelled", { cost: used });
            return;
          }
          if (["queued", "in_progress"].includes(response.status)) {
            await call("waiting");
            return;
          }
          if (response.status !== "completed") {
            await call("error", {
              error:
                response.status === "incomplete"
                  ? "Output limit reached. Reduce evidence or split the audit."
                  : "Provider assessment failed.",
              retryable: response.status === "failed",
              uncertain: false,
              cost: used,
            });
            return;
          }
          const envelope = outputSchema(job.stage).parse(
            JSON.parse(outputText(response)),
          );
          if (!envelope.result || envelope.needs_evidence.length) {
            await call("insufficient", {
              cost: used,
              error:
                envelope.needs_evidence.join(" ") || "More evidence required.",
            });
            return;
          }
          let output: unknown = envelope.result;
          if (job.stage === "extraction") {
            const asset = evidence.find((e) => e.id === job.asset_id)!;
            const extracted = extractionSchema.parse(output);
            if (asset.mime.startsWith("text/")) {
              const { data, error } = await db.storage
                .from("evidence")
                .download(asset.path);
              if (error || !data)
                throw new Error("Source unreadable during validation.");
              const facts = textEvidence(await data.text(), asset).facts;
              extracted.observations = extracted.observations.slice(
                0,
                100 - facts.length,
              );
              extracted.observations.push(
                ...facts.map((text, i) => ({
                  id: `code-${i}`,
                  locator:
                    asset.mime === "text/csv"
                      ? "CSV · all rows"
                      : "Source file",
                  text,
                  kind: "fact" as const,
                  date: null,
                  verified: false,
                })),
              );
            }
            extracted.observations = extracted.observations.map((o, i) => ({
              ...o,
              id: `${asset.id}:${i + 1}`,
              verified: false,
            }));
            output = extracted;
          }
          if (job.stage === "assessment")
            validateAssessment(
              assessmentSchema.parse(output),
              evidence,
              audit.setup.channels,
            );
          if (job.stage === "drafting")
            validateReport(reportSchema.parse(output), evidence);
          await call("complete", { output, cost: used });
          return;
        }
        if (
          job.status !== "Running" ||
          ["Cancelled", "Deleting"].includes(audit.status)
        )
          return;
        let instructions: string, content: unknown[];
        if (job.stage === "extraction") {
          const asset = evidence.find((e) => e.id === job.asset_id);
          if (!asset) throw new Error("Source file missing.");
          const { data, error } = await db.storage
            .from("evidence")
            .download(asset.path);
          if (error || !data) throw new Error("Source unreadable.");
          const bytes = new Uint8Array(await data.arrayBuffer());
          verifyBytes(bytes, asset.mime);
          instructions = EXTRACTION_RULES;
          content = [
            {
              type: "input_text",
              text: JSON.stringify({
                channel: asset.channel,
                source: asset.source,
                captured_at: asset.captured_at,
              }),
            },
          ];
          if (asset.mime === "application/pdf")
            content.push({
              type: "input_file",
              filename: asset.name,
              file_data: `data:application/pdf;base64,${base64(bytes)}`,
              detail: "high",
            });
          else if (asset.mime.startsWith("image/"))
            content.push({
              type: "input_image",
              image_url: `data:${asset.mime};base64,${base64(bytes)}`,
              detail: "high",
            });
          else {
            const parsed = textEvidence(new TextDecoder().decode(bytes), asset);
            if (!parsed.text.trim())
              throw new Error("No readable text. Supply another file.");
            content.push({
              type: "input_text",
              text: JSON.stringify({
                untrusted_source: parsed.text,
                code_facts: parsed.facts,
              }),
            });
          }
        } else {
          const prompt = promptInput(job.stage, audit, evidence, revision);
          instructions = prompt.instructions;
          content = [{ type: "input_text", text: JSON.stringify(prompt.data) }];
        }
        const body = requestBody(job.stage, instructions, content, job);
        const count = await provider("responses/input_tokens", "POST", {
          model: body.model,
          instructions: body.instructions,
          input: body.input,
          text: body.text,
          reasoning: body.reasoning,
        });
        if (!count.ok)
          throw new Error("Token check failed. No assessment submitted.");
        const tokens = await count.json();
        if (
          !Number.isInteger(tokens.input_tokens) ||
          tokens.input_tokens > MAX_INPUT
        )
          throw new Error("Evidence exceeds 200,000 tokens. Split the audit.");
        const reserved = await call("reserve", {
          cost: MAX_CALL_USD,
          prompt_version: PROMPT_VERSION,
          budget_cap: canary ? 5 : Number(audit.budget_usd),
        });
        if (!reserved?.allowed) return;
        submitted = true;
        const response = await provider(
          "responses",
          "POST",
          body,
          `${job.id}-${job.attempts + 1}`,
        );
        if (!response.ok) {
          const uncertain = response.status >= 500;
          await call("error", {
            error: uncertain
              ? "Submission uncertain. Check provider logs."
              : `Provider rejected request (${response.status}).`,
            uncertain,
            retryable: response.status === 429,
            cost: 0,
          });
          return;
        }
        const result = await response.json();
        if (typeof result.id !== "string")
          throw new Error("Provider response ID missing.");
        await call("submitted", { response_id: result.id });
      } catch (e) {
        const message = (e as Error).message;
        if (c?.job.stage === "deletion") {
          await call("defer", { error: message });
        } else if (c?.job.response_id && !used) {
          await call("waiting");
        } else {
          await call("error", {
            error: submitted
              ? "Submission uncertain. Check provider logs."
              : message,
            uncertain: submitted,
            retryable: false,
            cost: used,
          });
        }
      }
    }),
  );
  return Response.json({ checked: jobs.length });
}
if (import.meta.main) Deno.serve(handler);
