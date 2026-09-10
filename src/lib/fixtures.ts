import {
  PRINCIPLES,
  type Audit,
  type Assessment,
  type Calibration,
  type Evidence,
  type Report,
  type Revision,
  type Snapshot,
} from "../../supabase/functions/_shared/domain";
export const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  member: "10000000-0000-4000-8000-000000000002",
  client: "20000000-0000-4000-8000-000000000001",
  audit: "30000000-0000-4000-8000-000000000001",
};
const now = "2026-09-08T00:00:00Z";
export function fixtureAssessment(evidence: Evidence[]): Assessment {
  const channels = [
    ...new Set(
      evidence.filter((e) => e.status === "Verified").map((e) => e.channel),
    ),
  ];
  return {
    channels: channels.map((channel, i) => ({
      channel,
      tier: "Thin",
      confidence: 0.6,
      evidence_reviewed: `${evidence.filter((e) => e.channel === channel && e.status === "Verified").length} synthetic files`,
      principles: Object.fromEntries(
        PRINCIPLES.map((p, n) => [
          p,
          {
            score: [4, 3, 4, 3, 3][(n + i) % 5],
            evidence_ids: evidence
              .filter((e) => e.channel === channel && e.status === "Verified")
              .flatMap((e) =>
                e.observations.filter((o) => o.verified).map((o) => o.id),
              )
              .slice(0, 2),
            confidence: 0.6,
            rationale: `${channel} repeats the ${p} pattern in this synthetic sample.`,
            next_step: `Repeat the ${p} device across the next series.`,
          },
        ]),
      ) as Assessment["channels"][number]["principles"],
    })),
    adjustment: 0,
    adjustment_reason: "The sample does not establish ecosystem handoffs.",
    adjustment_evidence_ids: [],
    limitations: ["Synthetic preview. Scores do not describe a real brand."],
  };
}
export function fixtureReport(evidence: Evidence[]): Report {
  const refs = evidence
    .filter((e) => e.status === "Verified")
    .flatMap((e) => e.observations.filter((o) => o.verified).map((o) => o.id))
    .slice(0, 2);
  return {
    headline: "A clear identity. An uneven publishing system.",
    findings: [
      {
        text: "The website establishes a recognisable voice. Social proof is less consistent.",
        evidence_ids: refs,
      },
      {
        text: "Recurring formats could connect the channels more clearly.",
        evidence_ids: refs,
      },
    ],
    needs: [
      {
        category: "Content strategy",
        text: "Always-on Content Platform: connect uneven publishing through recurring proof-led formats. Discuss a platform and activation roadmap with HGM.",
        evidence_ids: refs,
      },
    ],
    priorities: [
      { text: "Define three recurring content formats.", evidence_ids: refs },
      { text: "Name the expert behind each proof point.", evidence_ids: refs },
      { text: "Connect social stories to the website.", evidence_ids: refs },
    ],
    limitations: ["Synthetic evidence only. Outcomes are unknown."],
  };
}
export const calibration = Object.fromEntries(
  PRINCIPLES.map((p) => [
    p,
    `A repeated, recognisable ${p} pattern suited to the audience.`,
  ]),
) as Calibration;
export function fixtureRevision(a: Audit, evidence: Evidence[]): Revision {
  const assessment = fixtureAssessment(evidence);
  return {
    id: crypto.randomUUID(),
    audit_id: a.id,
    version: a.revision,
    calibration,
    assessment,
    original_assessment: structuredClone(assessment),
    report: fixtureReport(evidence),
    changes: [],
    resolved_flags: {},
    approved_at: null,
    approved_by: null,
    model: "gpt-5.4-2026-03-05",
    rubric_version: "oma-1.0.0",
    prompt_version: "oma-1.0.0",
    created_at: now,
  };
}
export function fixture(): Snapshot {
  const me = {
    id: ids.admin,
    name: "Alex Morgan",
    email: "alex@example.test",
    role: "admin" as const,
    active: true,
  };
  const a: Audit = {
    id: ids.audit,
    client_id: ids.client,
    title: "Owned media · September 2026",
    status: "Review",
    setup: {
      title: "Owned media · September 2026",
      audience: "Design-conscious travellers",
      category: "Independent accommodation",
      period_start: "2026-07-01",
      period_end: "2026-08-31",
      channels: ["Website", "Instagram", "Email"],
      strategist_id: ids.admin,
      pov_score: 3.5,
      pov_rationale:
        "A clear visual identity; proof and channel handoffs may vary.",
    },
    revision: 1,
    evidence_version: 1,
    pov_locked_at: now,
    budget_usd: 25,
    spent_usd: 2.18,
    reserved_usd: 0,
    created_at: now,
    updated_at: now,
  };
  const evidence: Evidence[] = a.setup.channels.map((channel, i) => ({
    id: crypto.randomUUID(),
    audit_id: a.id,
    channel,
    name: ["Website sample.pdf", "Instagram posts.csv", "Welcome email.html"][
      i
    ],
    mime: ["application/pdf", "text/csv", "text/html"][i],
    bytes: 1200,
    path: `synthetic/${i}`,
    captured_at: "2026-08-31",
    source: "Synthetic preview fixture",
    status: "Verified",
    observations: [
      {
        id: `demo-${i + 1}`,
        locator: ["Page 1", "Rows 2–6", "Email body"][i],
        text: [
          "The headline uses a concise invitation and repeats a distinctive framing device.",
          "Five dated posts repeat the voice; two identify the local maker.",
          "The welcome message links to a location guide and names its author.",
        ][i],
        kind: "fact",
        date: null,
        verified: true,
      },
    ],
    limitations: ["Small synthetic sample."],
    exclusion_reason: null,
  }));
  const draft = {
    ...structuredClone(a),
    setup: {
      ...structuredClone(a.setup),
      channels: ["Website"] as Audit["setup"]["channels"],
    },
    id: crypto.randomUUID(),
    title: "Spring content review",
    status: "Draft" as const,
    pov_locked_at: null,
    spent_usd: 0,
  };
  const approved = {
    ...structuredClone(a),
    id: crypto.randomUUID(),
    title: "Owned media · June 2026",
    status: "Approved" as const,
    updated_at: "2026-09-04T00:00:00Z",
  };
  const approvedEvidence = evidence.map((e) => ({
    ...structuredClone(e),
    id: crypto.randomUUID(),
    audit_id: approved.id,
  }));
  const ar = fixtureRevision(approved, approvedEvidence);
  ar.approved_at = now;
  ar.approved_by = ids.admin;
  return {
    me,
    members: [
      me,
      {
        id: ids.member,
        name: "Jamie Lee",
        email: "jamie@example.test",
        role: "member",
        active: true,
      },
    ],
    clients: [
      {
        id: ids.client,
        name: "Northline House",
        context: "Independent stays. Local perspective.",
        created_at: now,
      },
    ],
    assignments: [
      { client_id: ids.client, user_id: ids.admin },
      { client_id: ids.client, user_id: ids.member },
    ],
    audits: [a, draft, approved],
    evidence: [...evidence, ...approvedEvidence],
    revisions: [
      fixtureRevision(a, evidence),
      {
        ...fixtureRevision(draft, evidence),
        assessment: null,
        original_assessment: null,
        calibration: null,
        report: null,
      },
      ar,
    ],
    jobs: [],
    feedback: [],
    ledger: [],
  };
}
