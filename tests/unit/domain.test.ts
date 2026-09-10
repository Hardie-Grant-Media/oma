import { describe, it, expect } from "vitest";
import {
  PRINCIPLES,
  canApprove,
  channelTotal,
  copyFlags,
  reconcile,
  totals,
  validateAssessment,
  validateReport,
  validateUpload,
} from "../../supabase/functions/_shared/domain";
import { fixture } from "../../src/lib/fixtures";
import {
  promptInput,
  EXTRACTION_RULES,
  RUBRIC,
} from "../../supabase/functions/_shared/prompts";
import {
  escapeHtml,
  renderReport,
} from "../../supabase/functions/_shared/report";
import {
  parseCsv,
  safeHtmlText,
  textEvidence,
  verifyBytes,
} from "../../supabase/functions/_shared/extract";
import {
  MAX_CALL_USD,
  MAX_OUTPUT,
  outputSchema,
  requestBody,
  usageCost,
} from "../../supabase/functions/_shared/provider";
const state = () => {
  const s = fixture();
  const a = s.audits[0],
    r = s.revisions[0],
    e = s.evidence.filter((e) => e.audit_id === a.id);
  return { s, a, r, e };
};
it("keeps extraction separate from scoring sufficiency", () => {
  const job = { id: "test", audit_id: "test" };
  const extract = requestBody("extraction", EXTRACTION_RULES, [], job);
  const assess = requestBody("assessment", RUBRIC, [], job);
  expect(extract.instructions).toContain("Do not score, calibrate");
  expect(extract.instructions).toContain("text AND visual details");
  expect(extract.instructions).toContain("UNTRUSTED EVIDENCE");
  expect(extract.instructions).not.toContain("Scores: 1");
  expect(extract.instructions).not.toContain(
    "If evidence cannot support the requested assessment",
  );
  expect(assess.instructions).toContain(
    "If evidence cannot support the requested assessment",
  );
  expect(extract.metadata.prompt_version).toBe("oma-1.0.2");
});
describe("Scoring", () => {
  it("calculates exact weighted scores, fixed ideals and deterministic rankings", () => {
    const { r } = state();
    const c = r.assessment!.channels[0];
    for (const p of PRINCIPLES) c.principles[p].score = 5;
    expect(channelTotal(c)).toEqual({
      weighted5: 5,
      display20: 20,
      closeness: 1,
    });
    for (const p of PRINCIPLES) c.principles[p].score = 1;
    expect(channelTotal(c)).toEqual({
      weighted5: 1,
      display20: 4,
      closeness: 0,
    });
    expect(totals(r.assessment!)).toEqual(
      totals(structuredClone(r.assessment!)),
    );
  });
  it.each([
    [1, 0, 5, 4, "Fragmented"],
    [2, 1, 11, 9, "Functional, not connected"],
    [3, 1, 16, 13, "Connected but uneven"],
    [4, 1, 21, 17, "Category-defining"],
    [5, 1, 25, 20, "Category-defining"],
  ])(
    "preserves bands (%s)",
    (score, adjustment, internal20, display20, band) => {
      const { r } = state();
      const a = r.assessment!;
      for (const c of a.channels)
        for (const p of PRINCIPLES) c.principles[p].score = Number(score);
      a.adjustment = Number(adjustment);
      expect(totals(a)).toMatchObject({
        internal25: internal20,
        display20,
        band,
      });
    },
  );
  it("uses signed drift and absolute verdicts", () => {
    const { r } = state();
    expect(reconcile(r.assessment!, 5).gap).toBeLessThan(0);
    expect(reconcile(r.assessment!, 1).verdict).toBe("Review divergence");
  });
  it("rejects absent or cross-channel sources", () => {
    const { r, e, a } = state();
    r.assessment!.channels[0].principles.memory.evidence_ids = ["invented"];
    expect(() =>
      validateAssessment(r.assessment!, e, a.setup.channels),
    ).toThrow("unverified");
    r.report!.findings[0].evidence_ids = ["invented"];
    expect(() => validateReport(r.report!, e)).toThrow("unverified");
  });
  it("never treats excluded evidence as performance", () => {
    const { r, e, a } = state();
    e[0].status = "Excluded";
    expect(() =>
      validateAssessment(r.assessment!, e, a.setup.channels),
    ).toThrow("coverage");
  });
});
describe("Governance", () => {
  it("approves only the active designated strategist and current revision", () => {
    const { s, a, r, e } = state();
    expect(() => canApprove(a, r, s.me, e)).not.toThrow();
    expect(() => canApprove(a, r, { ...s.me, id: s.members[1].id }, e)).toThrow(
      "strategist",
    );
    expect(() => canApprove(a, r, { ...s.me, active: false }, e)).toThrow();
    expect(() => canApprove({ ...a, revision: 2 }, r, s.me, e)).toThrow(
      "current",
    );
    expect(() =>
      canApprove({ ...a, status: "Approved" }, r, s.me, e),
    ).toThrow();
  });
  it("requires copy and divergence resolution", () => {
    const { s, a, r, e } = state();
    r.report!.headline = "Unlock seamless outcomes";
    expect(copyFlags(r.report!)).toHaveLength(1);
    expect(() => canApprove(a, r, s.me, e)).toThrow("copy");
    r.resolved_flags[r.report!.headline] = "Reviewer quotation retained.";
    expect(() =>
      canApprove({ ...a, setup: { ...a.setup, pov_score: 1 } }, r, s.me, e),
    ).toThrow("POV");
  });
  it.each(["calibration", "assessment", "drafting"])(
    "withholds POV from %s",
    (stage) => {
      const { a, r, e } = state();
      a.setup.pov_rationale = "SECRET_PREDICTION";
      const request = JSON.stringify(promptInput(stage, a, e, r));
      expect(request).not.toContain("pov_score");
      expect(request).not.toContain("SECRET_PREDICTION");
      expect(request).not.toContain("resolved_flags");
      expect(request).toContain("UNTRUSTED EVIDENCE");
    },
  );
  it("requires evidence when structured assessment is unavailable", () => {
    expect(
      outputSchema("assessment").parse({
        result: null,
        needs_evidence: ["Supply chronology."],
      }),
    ).toMatchObject({ result: null });
  });
});
describe("Evidence safety", () => {
  it("enforces all file limits", () => {
    expect(validateUpload("x.PDF", 20 * 1024 * 1024, 0, 0)).toBe(
      "application/pdf",
    );
    expect(() => validateUpload("x.svg", 12, 0, 0)).toThrow();
    expect(() => validateUpload("x.csv", 2 * 1024 * 1024 + 1, 0, 0)).toThrow();
    expect(() => validateUpload("x.jpg", 1, 100 * 1024 * 1024, 0)).toThrow();
    expect(() => validateUpload("x.txt", 1, 0, 50)).toThrow();
  });
  it("rejects mismatched file bytes", () => {
    expect(() =>
      verifyBytes(new TextEncoder().encode("<script>"), "application/pdf"),
    ).toThrow();
    expect(() => verifyBytes(new Uint8Array([0]), "text/plain")).toThrow();
  });
  it("strips active HTML without loading resources", () => {
    expect(
      safeHtmlText(
        '<script>steal()</script><style>secret</style><p onclick="steal()">Hello</p><iframe src="https://evil.test">hidden</iframe><img src="https://evil.test"><svg><text>hidden</text></svg>',
      ),
    ).toBe("Hello");
  });
  it("parses quoted CSV and deterministic counts", () => {
    expect(
      parseCsv('date,text\r\n2026-01-01,"a,b"\r\n2026-01-02,"two\nlines"'),
    ).toHaveLength(3);
    expect(() => parseCsv('a,"oops')).toThrow();
    const { e } = state();
    expect(
      textEvidence("date,text\n2026-01-01,hello\n2026-01-02,bye", {
        ...e[0],
        mime: "text/csv",
      }).facts[0],
    ).toContain("2 data rows");
  });
});
describe("Report and budget", () => {
  it("exports all 11 sections without scripts, network resources or POV", () => {
    const { a, r, e } = state();
    r.report!.headline = "<img src=x onerror=alert(1)>";
    const html = renderReport(a, r, e, "Synthetic");
    expect(html.match(/<section /g) ?? []).toHaveLength(11);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("pov_score");
    expect(html).toContain("&lt;img");
    expect(escapeHtml('"&')).toBe("&quot;&amp;");
  });
  it("reserves the input tier and caps provider output", () => {
    const req = requestBody("calibration", "rules", [], {
      id: "x",
      audit_id: "y",
    });
    expect(req).toMatchObject({
      background: true,
      store: true,
      max_output_tokens: MAX_OUTPUT,
      service_tier: "default",
      reasoning: { effort: "medium" },
    });
    expect(req).not.toHaveProperty("tools");
    expect(MAX_CALL_USD).toBeGreaterThan(
      usageCost({ input_tokens: 200000, output_tokens: 8192 }, 0),
    );
    expect(usageCost(undefined, MAX_CALL_USD)).toBe(MAX_CALL_USD);
  });
});
