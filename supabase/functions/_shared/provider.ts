import { z } from "zod";
import {
  MODEL,
  PROMPT_VERSION,
  RUBRIC_VERSION,
  assessmentSchema,
  calibrationSchema,
  extractionSchema,
  reportSchema,
} from "./domain.ts";
export const MAX_OUTPUT = 8192,
  MAX_INPUT = 200000;
// Standard pricing, verified 2026-09-08. Reserve the complete <=272k input tier.
export const INPUT_RATE = 2.5,
  OUTPUT_RATE = 15,
  MAX_CALL_USD = (272000 * INPUT_RATE + MAX_OUTPUT * OUTPUT_RATE) / 1e6;
export const stageSchemas = {
  extraction: extractionSchema,
  calibration: calibrationSchema,
  assessment: assessmentSchema,
  drafting: reportSchema,
};
export type Stage = keyof typeof stageSchemas;
export function outputSchema(stage: Stage) {
  return z.object({
    result: stageSchemas[stage].nullable(),
    needs_evidence: z.array(z.string().min(1).max(1800)).max(20),
  });
}
export function requestBody(
  stage: Stage,
  instructions: string,
  content: unknown[],
  job: { id: string; audit_id: string },
) {
  const schema = z.toJSONSchema(outputSchema(stage));
  delete schema.$schema;
  return {
    model: MODEL,
    instructions:
      instructions +
      (stage === "extraction"
        ? "\nReturn result:null only if the source is unreadable or contains no extractable observations. Partial readable evidence belongs in result, with limitations; needs_evidence may be empty."
        : "\nIf evidence cannot support the requested assessment, return result:null and list needs_evidence. Never fill gaps with guessed scores."),
    input: [{ role: "user", content }],
    reasoning: { effort: "medium" },
    text: {
      format: {
        type: "json_schema",
        name: `oma_${stage}`,
        strict: true,
        schema,
      },
    },
    max_output_tokens: MAX_OUTPUT,
    background: true,
    store: true,
    service_tier: "default",
    metadata: {
      job_id: job.id,
      audit_id: job.audit_id,
      prompt_version: PROMPT_VERSION,
      rubric_version: RUBRIC_VERSION,
    },
  };
}
export function usageCost(
  usage: { input_tokens: number; output_tokens: number } | undefined,
  fallback: number,
) {
  if (!usage) return fallback;
  const long = usage.input_tokens > 272000;
  return (
    Math.ceil(
      ((usage.input_tokens * INPUT_RATE * (long ? 2 : 1) +
        usage.output_tokens * OUTPUT_RATE * (long ? 1.5 : 1)) *
        1e6) /
        1e6,
    ) / 1e6
  );
}
export function outputText(response: {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
}) {
  const texts =
    response.output
      ?.filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "") ?? [];
  if (texts.length !== 1)
    throw new Error("No structured assessment. Check evidence.");
  return texts[0];
}
