import { z } from "zod";

export const PRINCIPLES = [
  "memory",
  "credibility",
  "consistency",
  "relevance",
  "feeling",
] as const;
export const CHANNELS = [
  "Website",
  "Instagram",
  "LinkedIn",
  "Facebook",
  "Email",
  "Print",
  "Content hub",
] as const;
export const WEIGHTS = {
  memory: 0.3,
  credibility: 0.25,
  consistency: 0.18,
  relevance: 0.15,
  feeling: 0.12,
};
export const MODEL = "gpt-5.4-2026-03-05";
export const RUBRIC_VERSION = "oma-1.0.0";
export const PROMPT_VERSION = "oma-1.0.2";
export const REPORT_VERSION = "oma-1.1.0";
export const LIMITS = {
  imageOrPdf: 20 * 1024 * 1024,
  text: 2 * 1024 * 1024,
  total: 100 * 1024 * 1024,
  assets: 50,
  attempts: 3,
};
export type Principle = (typeof PRINCIPLES)[number];
export type Channel = (typeof CHANNELS)[number];
export type Status =
  | "Draft"
  | "Processing"
  | "Evidence review"
  | "Assessing"
  | "Review"
  | "Approved"
  | "Paused"
  | "Failed"
  | "Cancelled"
  | "Deleting";

const line = z.string().trim().min(1).max(1800);
export const setupSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    audience: line,
    category: line,
    period_start: z.string().date(),
    period_end: z.string().date(),
    channels: z.array(z.enum(CHANNELS)).min(1).max(7),
    strategist_id: z.string().uuid(),
    pov_score: z.number().min(1).max(5),
    pov_rationale: line,
  })
  .refine((s) => s.period_end >= s.period_start, "Check the dates.")
  .refine(
    (s) => new Set(s.channels).size === s.channels.length,
    "Duplicate channel.",
  );
export type Setup = z.infer<typeof setupSchema>;

export const observationSchema = z.object({
  id: z.string().min(1).max(100),
  locator: line,
  text: line,
  kind: z.enum(["fact", "visual", "quote", "cadence", "proof"]),
  date: z.string().nullable(),
  verified: z.boolean(),
});
export const extractionSchema = z.object({
  observations: z.array(observationSchema).min(1).max(100),
  limitations: z.array(line).max(20),
});
export type Observation = z.infer<typeof observationSchema>;
export type Evidence = {
  id: string;
  audit_id: string;
  channel: Channel;
  name: string;
  mime: string;
  bytes: number;
  path: string;
  captured_at: string;
  source: string;
  status: "Pending" | "Ready" | "Extracted" | "Verified" | "Excluded";
  observations: Observation[];
  limitations: string[];
  exclusion_reason: string | null;
};

const scoreSchema = z.object({
  confidence: z.number().min(0).max(1),
  score: z.number().int().min(1).max(5),
  evidence_ids: z.array(z.string()).min(1).max(30),
  rationale: line,
  next_step: line,
});
export const calibrationSchema = z.object(
  Object.fromEntries(PRINCIPLES.map((p) => [p, line])) as Record<
    Principle,
    typeof line
  >,
);
export type Calibration = z.infer<typeof calibrationSchema>;
export const channelScoreSchema = z.object({
  channel: z.enum(CHANNELS),
  tier: z.enum(["Thin", "Lean", "Standard", "Deep"]),
  confidence: z.number().min(0).max(1),
  evidence_reviewed: line,
  principles: z.object(
    Object.fromEntries(PRINCIPLES.map((p) => [p, scoreSchema])) as Record<
      Principle,
      typeof scoreSchema
    >,
  ),
});
export const assessmentSchema = z.object({
  channels: z.array(channelScoreSchema).min(1).max(7),
  adjustment: z.number().int().min(-1).max(1),
  adjustment_reason: line,
  adjustment_evidence_ids: z.array(z.string()).max(30),
  limitations: z.array(line).max(30),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export type ChannelScore = z.infer<typeof channelScoreSchema>;
export const claimSchema = z.object({
  text: line,
  evidence_ids: z.array(z.string()).min(1).max(30),
});
export const reportSchema = z.object({
  headline: line,
  findings: z.array(claimSchema).min(1).max(6),
  needs: z
    .array(
      claimSchema.extend({
        category: z.enum([
          "Brand expression",
          "Content strategy",
          "Channel strategy",
          "Measurement",
          "Creative formats",
          "Publishing",
        ]),
      }),
    )
    .max(6),
  priorities: z.array(claimSchema).length(3),
  limitations: z.array(line).max(30),
});
export type Report = z.infer<typeof reportSchema>;
export type Revision = {
  id: string;
  audit_id: string;
  version: number;
  calibration: Calibration | null;
  assessment: Assessment | null;
  original_assessment: Assessment | null;
  report: Report | null;
  changes: {
    at: string;
    actor: string;
    reason: string;
    evidence_ids: string[];
  }[];
  resolved_flags: Record<string, string>;
  approved_at: string | null;
  approved_by: string | null;
  model: string;
  rubric_version: string;
  prompt_version: string;
  created_at: string;
};
export type Audit = {
  id: string;
  client_id: string;
  title: string;
  status: Status;
  setup: Setup;
  revision: number;
  evidence_version: number;
  pov_locked_at: string | null;
  budget_usd: number;
  spent_usd: number;
  reserved_usd: number;
  created_at: string;
  updated_at: string;
};
export type Member = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  active: boolean;
};
export type Client = {
  id: string;
  name: string;
  context: string;
  created_at: string;
};
export type Job = {
  id: string;
  audit_id: string;
  stage: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  response_id?: string | null;
};
export type Feedback = {
  id: string;
  audit_id: string;
  note: string;
  created_at: string;
  author_id: string;
};
export type LedgerEntry = {
  id: string;
  audit_id: string;
  revision: number;
  pov: number;
  result: number;
  gap: number;
  verdict: string;
  created_at: string;
};
export type Snapshot = {
  me: Member;
  members: Member[];
  clients: Client[];
  assignments: { client_id: string; user_id: string }[];
  audits: Audit[];
  evidence: Evidence[];
  revisions: Revision[];
  jobs: Job[];
  feedback: Feedback[];
  ledger: LedgerEntry[];
  usage?: {
    id: string;
    job_id: string;
    audit_id: string;
    stage: string;
    reserved_usd: number;
    charged_usd: number | null;
    model: string;
    created_at: string;
    closed_at: string | null;
  }[];
};

export function channelTotal(channel: ChannelScore) {
  const weighted5 = PRINCIPLES.reduce(
    (n, p) => n + channel.principles[p].score * WEIGHTS[p],
    0,
  );
  const ideal = Math.sqrt(
    PRINCIPLES.reduce(
      (n, p) => n + ((5 - channel.principles[p].score) * WEIGHTS[p]) ** 2,
      0,
    ),
  );
  const anti = Math.sqrt(
    PRINCIPLES.reduce(
      (n, p) => n + ((channel.principles[p].score - 1) * WEIGHTS[p]) ** 2,
      0,
    ),
  );
  return {
    weighted5,
    display20: Math.round(weighted5 * 4),
    closeness: anti / (ideal + anti),
  };
}
export function totals(input: Assessment) {
  const assessment = assessmentSchema.parse(input);
  const channels = assessment.channels.map((c) => ({
    channel: c.channel,
    ...channelTotal(c),
  }));
  const internal25 = Math.max(
    0,
    Math.min(
      25,
      Math.round(
        channels.reduce((n, c) => n + c.weighted5 * 5, 0) / channels.length +
          assessment.adjustment,
      ),
    ),
  );
  const band =
    internal25 >= 21
      ? "Category-defining"
      : internal25 >= 16
        ? "Connected but uneven"
        : internal25 >= 11
          ? "Functional, not connected"
          : "Fragmented";
  return {
    channels,
    internal25,
    display20: Math.round((internal25 / 25) * 20),
    band,
    ranking: [...channels].sort(
      (a, b) => b.closeness - a.closeness || a.channel.localeCompare(b.channel),
    ),
  };
}
export function reconcile(assessment: Assessment, pov: number) {
  const result = totals(assessment).internal25 / 5;
  const gap = Math.round((result - pov) * 100) / 100;
  return {
    pov,
    result,
    gap,
    verdict:
      Math.abs(gap) <= 0.5
        ? "Confirmed"
        : Math.abs(gap) <= 1
          ? "Broadly confirmed"
          : "Review divergence",
  };
}
export function confidenceLabel(n: number) {
  return n >= 0.75 ? "High" : n >= 0.5 ? "Moderate" : "Low";
}
export function validateAssessment(
  a: Assessment,
  evidence: Evidence[],
  channels: string[],
) {
  assessmentSchema.parse(a);
  const verifiedIds = new Set(
    evidence
      .filter((e) => e.status === "Verified")
      .flatMap((e) =>
        e.observations.filter((o) => o.verified).map((o) => o.id),
      ),
  );
  if (
    (a.adjustment !== 0 && !a.adjustment_evidence_ids.length) ||
    a.adjustment_evidence_ids.some((id) => !verifiedIds.has(id))
  )
    throw new Error("Ecosystem adjustment needs verified evidence.");
  const expected = channels.filter((c) =>
    evidence.some((e) => e.channel === c && e.status === "Verified"),
  );
  if (
    a.channels.length !== expected.length ||
    new Set(a.channels.map((c) => c.channel)).size !== expected.length ||
    a.channels.some((c) => !expected.includes(c.channel))
  )
    throw new Error("Channel coverage differs from verified evidence.");
  for (const c of a.channels) {
    const ids = new Set(
      evidence
        .filter((e) => e.channel === c.channel && e.status === "Verified")
        .flatMap((e) =>
          e.observations.filter((o) => o.verified).map((o) => o.id),
        ),
    );
    for (const p of PRINCIPLES)
      if (c.principles[p].evidence_ids.some((id) => !ids.has(id)))
        throw new Error("Score has an unverified source.");
  }
}
export function validateReport(report: Report, evidence: Evidence[]) {
  reportSchema.parse(report);
  const ids = new Set(
    evidence
      .filter((e) => e.status === "Verified")
      .flatMap((e) =>
        e.observations.filter((o) => o.verified).map((o) => o.id),
      ),
  );
  for (const claim of [
    ...report.findings,
    ...report.needs,
    ...report.priorities,
  ])
    if (claim.evidence_ids.some((id) => !ids.has(id)))
      throw new Error("Finding has an unverified source.");
}
export function copyFlags(
  report: Report,
): { id: string; text: string; reason: string }[] {
  const banned =
    /\b(leverage|utilise|unlock|supercharge|robust|holistic|seamless|estate|topsis)\b|[—]|the supplied evidence suggests|it appears that|may potentially/i;
  return [
    report.headline,
    ...report.findings.map((c) => c.text),
    ...report.needs.map((c) => c.text),
    ...report.priorities.map((c) => c.text),
    ...report.limitations,
  ].flatMap((text) => {
    const reason = banned.test(text)
      ? "Check wording."
      : text.split(/\s+/).length > 30
        ? "Shorten if possible."
        : null;
    return reason ? [{ id: text, text, reason }] : [];
  });
}
export function validateUpload(
  name: string,
  size: number,
  total: number,
  count: number,
) {
  const ext = name.split(".").at(-1)?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    csv: "text/csv",
    html: "text/html",
    htm: "text/html",
    txt: "text/plain",
  };
  if (!mime[ext]) throw new Error("Use PDF, JPG, PNG, CSV, HTML or TXT.");
  const limit = ["pdf", "png", "jpg", "jpeg"].includes(ext)
    ? LIMITS.imageOrPdf
    : LIMITS.text;
  if (size <= 0 || size > limit)
    throw new Error(`File limit: ${limit / 1024 / 1024} MB.`);
  if (total + size > LIMITS.total || count >= LIMITS.assets)
    throw new Error("Audit limit: 50 files, 100 MB.");
  return mime[ext];
}
export function canApprove(
  a: Audit,
  r: Revision,
  actor: Member,
  evidence: Evidence[],
) {
  if (!actor.active || actor.id !== a.setup.strategist_id)
    throw new Error("Only the strategist can approve.");
  if (a.status !== "Review" || r.version !== a.revision || r.approved_at)
    throw new Error("Review the current revision.");
  if (!r.assessment || !r.report || !r.calibration)
    throw new Error("Finish the assessment.");
  validateAssessment(r.assessment, evidence, a.setup.channels);
  validateReport(r.report, evidence);
  if (copyFlags(r.report).some((f) => !r.resolved_flags[f.id]?.trim()))
    throw new Error("Resolve the copy flags.");
  if (
    Math.abs(reconcile(r.assessment, a.setup.pov_score).gap) > 1 &&
    !r.resolved_flags.divergence?.trim()
  )
    throw new Error("Explain the POV difference.");
}
