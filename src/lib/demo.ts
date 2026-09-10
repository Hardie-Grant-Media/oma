// Development-only synthetic adapter. Production builds cannot enable this path.
import {
  assessmentSchema,
  canApprove,
  extractionSchema,
  reconcile,
  reportSchema,
  setupSchema,
  validateAssessment,
  validateReport,
  validateUpload,
  type Audit,
  type Evidence,
  type Revision,
  type Snapshot,
} from "../../supabase/functions/_shared/domain";
import { renderReport } from "../../supabase/functions/_shared/report";
import { fixture, fixtureRevision } from "./fixtures";
const key = "oma-synthetic-v1";
let state: Snapshot;
try {
  state = JSON.parse(sessionStorage.getItem(key) ?? "null") ?? fixture();
} catch {
  state = fixture();
}
const save = () => sessionStorage.setItem(key, JSON.stringify(state));
export async function snapshot() {
  return structuredClone(state);
}
export async function command(
  action: string,
  p: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString(),
    uid = () => crypto.randomUUID();
  const a = state.audits.find((a) => a.id === p.audit_id);
  const e = state.evidence.find(
    (e) => e.id === p.asset_id && e.audit_id === a?.id,
  );
  if (action === "create_client") {
    const id = uid();
    state.clients.push({
      id,
      name: String(p.name),
      context: String(p.context ?? ""),
      created_at: now,
    });
    state.assignments.push({ client_id: id, user_id: state.me.id });
    save();
    return { id };
  }
  if (action === "create_audit") {
    const setup = setupSchema.parse(p.setup);
    const audit: Audit = {
      id: uid(),
      client_id: String(p.client_id),
      title: setup.title,
      setup,
      status: "Draft",
      revision: 1,
      evidence_version: 1,
      pov_locked_at: null,
      budget_usd: 25,
      spent_usd: 0,
      reserved_usd: 0,
      created_at: now,
      updated_at: now,
    };
    state.audits.unshift(audit);
    state.revisions.push({
      ...fixtureRevision(audit, state.evidence),
      assessment: null,
      original_assessment: null,
      calibration: null,
      report: null,
    });
    save();
    return { id: audit.id };
  }
  if (action === "assign") {
    state.assignments = state.assignments.filter(
      (x) => !(x.client_id === p.client_id && x.user_id === p.user_id),
    );
    if (p.assigned)
      state.assignments.push({
        client_id: String(p.client_id),
        user_id: String(p.user_id),
      });
    save();
    return {};
  }
  if (action === "provision") {
    state.members.push({
      id: uid(),
      name: String(p.name),
      email: String(p.email),
      active: true,
      role: "member",
    });
    save();
    return {};
  }
  if (action === "member") {
    const m = state.members.find((m) => m.id === p.user_id);
    if (m && m.id !== state.me.id) m.active = Boolean(p.active);
    save();
    return {};
  }
  if (!a) throw new Error("Audit not found.");
  const evidence = state.evidence.filter((e) => e.audit_id === a.id);
  const r = state.revisions.find(
    (r) => r.audit_id === a.id && r.version === a.revision,
  )!;
  if (p.revision !== undefined && p.revision !== a.revision)
    throw new Error("Audit changed. Refresh.");
  if (action === "setup") {
    if (a.pov_locked_at) throw new Error("Setup is locked.");
    a.setup = setupSchema.parse(p.setup);
    a.title = a.setup.title;
  } else if (action === "reserve_upload") {
    if (!["Draft", "Evidence review"].includes(a.status))
      throw new Error("Evidence is locked.");
    const mime = validateUpload(
      String(p.name),
      Number(p.bytes),
      evidence.reduce((s, e) => s + e.bytes, 0),
      evidence.length,
    );
    const asset: Evidence = {
      id: uid(),
      audit_id: a.id,
      channel: p.channel as Evidence["channel"],
      name: String(p.name),
      mime,
      bytes: Number(p.bytes),
      path: "synthetic",
      captured_at: String(p.captured_at),
      source: String(p.source ?? ""),
      status: "Pending",
      observations: [],
      limitations: [],
      exclusion_reason: null,
    };
    state.evidence.push(asset);
    save();
    return { id: asset.id };
  } else if (action === "finish_upload" && e) {
    e.status = "Ready";
    e.observations = [
      {
        id: `${e.id}:1`,
        locator: "Text 1",
        text:
          String(p.text ?? "Synthetic preview file.").slice(0, 1800) ||
          "Unreadable sample.",
        kind: "fact",
        date: null,
        verified: false,
      },
    ];
  } else if (action === "preview") {
    return {};
  } else if (action === "extract") {
    if (!evidence.some((e) => e.status === "Ready"))
      throw new Error("Upload evidence first.");
    evidence
      .filter((e) => e.status === "Ready")
      .forEach((e) => {
        e.status = "Extracted";
        e.limitations = ["Synthetic extraction. No AI call was made."];
      });
    a.status = "Evidence review";
  } else if (action === "verify_evidence" && e) {
    const out = extractionSchema.parse(p);
    if (out.observations.some((o) => !o.verified))
      throw new Error("Verify each observation.");
    e.observations = out.observations;
    e.limitations = out.limitations;
    e.status = "Verified";
  } else if (action === "exclude") {
    if (e) {
      e.status = "Excluded";
      e.exclusion_reason = String(p.reason);
    } else
      state.evidence.push({
        id: uid(),
        audit_id: a.id,
        channel: p.channel as Evidence["channel"],
        name: "Not supplied",
        mime: "text/plain",
        bytes: 0,
        path: uid(),
        captured_at: now.slice(0, 10),
        source: "",
        status: "Excluded",
        observations: [],
        limitations: [],
        exclusion_reason: String(p.reason),
      });
  } else if (action === "assess") {
    if (
      a.setup.pov_rationale === "To confirm" ||
      a.setup.audience === "To confirm"
    )
      throw new Error("Complete setup first.");
    if (
      evidence.some((e) => !["Verified", "Excluded"].includes(e.status)) ||
      !evidence.some((e) => e.status === "Verified")
    )
      throw new Error("Verify the evidence.");
    a.pov_locked_at = now;
    a.status = "Review";
    Object.assign(r, fixtureRevision(a, evidence));
  } else if (action === "save_review") {
    const assessment = assessmentSchema.parse(p.assessment),
      report = reportSchema.parse(p.report);
    validateAssessment(assessment, evidence, a.setup.channels);
    validateReport(report, evidence);
    if (
      JSON.stringify(assessment) !==
        JSON.stringify(assessmentSchema.parse(r.assessment)) &&
      (!String(p.reason ?? "").trim() || !(p.evidence_ids as unknown[])?.length)
    )
      throw new Error("Score changes need a reason and evidence.");
    const next: Revision = {
      ...structuredClone(r),
      id: uid(),
      version: a.revision + 1,
      assessment,
      report,
      approved_at: null,
      approved_by: null,
      resolved_flags: p.resolved_flags as Record<string, string>,
      changes: [
        ...r.changes,
        {
          at: now,
          actor: state.me.id,
          reason: String(p.reason ?? ""),
          evidence_ids: p.evidence_ids as string[],
        },
      ],
    };
    state.revisions.push(next);
    a.revision++;
    a.status = "Review";
  } else if (action === "approve") {
    canApprove(a, r, state.me, evidence);
    r.approved_at = now;
    r.approved_by = state.me.id;
    a.status = "Approved";
    state.ledger.push({
      id: uid(),
      audit_id: a.id,
      revision: a.revision,
      ...reconcile(r.assessment!, a.setup.pov_score),
      created_at: now,
    });
  } else if (action === "export") {
    const rev = state.revisions.find(
      (r) => r.audit_id === a.id && r.version === p.version,
    );
    if (!rev?.approved_at) throw new Error("Approve first.");
    return {
      html: renderReport(
        a,
        rev,
        evidence,
        state.clients.find((c) => c.id === a.client_id)!.name,
      ),
    };
  } else if (action === "budget") {
    if (
      Number(p.budget) > 25 ||
      Number(p.budget) < a.spent_usd + a.reserved_usd
    )
      throw new Error("Budget must cover usage and stay within $25.");
    a.budget_usd = Number(p.budget);
  } else if (action === "feedback") {
    state.feedback.unshift({
      id: uid(),
      audit_id: a.id,
      note: String(p.note),
      author_id: state.me.id,
      created_at: now,
    });
  } else if (action === "delete") {
    if (p.confirm !== a.title) throw new Error("Confirm title.");
    state.audits = state.audits.filter((x) => x.id !== a.id);
    for (const key of [
      "evidence",
      "revisions",
      "feedback",
      "jobs",
      "ledger",
    ] as const)
      state[key] = state[key].filter((x) => x.audit_id !== a.id) as never;
  } else if (action === "cancel") {
    a.status = "Cancelled";
  } else throw new Error("Action unavailable in this state.");
  a.updated_at = now;
  save();
  return { id: a.id };
}
