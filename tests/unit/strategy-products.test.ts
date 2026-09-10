import { expect, it } from "vitest";
import { fixture } from "../../src/lib/fixtures";
import {
  promptInput,
  EXTRACTION_RULES,
} from "../../supabase/functions/_shared/prompts";
import { STRATEGY_PRODUCTS } from "../../supabase/functions/_shared/strategy-products";
import { renderReport } from "../../supabase/functions/_shared/report";
import { validateReport } from "../../supabase/functions/_shared/domain";

it("supplies all product offers only after assessment, during drafting", () => {
  const s = fixture();
  const a = s.audits[0];
  const r = s.revisions[0];
  const evidence = s.evidence.filter((e) => e.audit_id === a.id);
  expect(STRATEGY_PRODUCTS).toHaveLength(15);
  for (const product of STRATEGY_PRODUCTS) {
    expect(EXTRACTION_RULES).not.toContain(JSON.stringify(product.name));
    for (const stage of ["calibration", "assessment"]) {
      expect(promptInput(stage, a, evidence, r).instructions).not.toContain(
        JSON.stringify(product.name),
      );
    }
    expect(promptInput("drafting", a, evidence, r).instructions).toContain(
      product.name,
    );
  }
  expect(promptInput("drafting", a, evidence, r).data.assessment).toEqual(
    r.assessment,
  );
});

it("keeps product recommendations subject to verified evidence validation", () => {
  const s = fixture();
  const a = s.audits[0];
  const r = s.revisions[0];
  const evidence = s.evidence.filter((e) => e.audit_id === a.id);
  expect(r.report!.needs[0].text).toContain("Always-on Content Platform");
  expect(() => validateReport(r.report!, evidence)).not.toThrow();
  expect(renderReport(a, r, evidence, "Test brand")).toContain(
    r.report!.needs[0].text,
  );
  r.report!.needs[0].evidence_ids = ["invented-sales-evidence"];
  expect(() => validateReport(r.report!, evidence)).toThrow(
    "unverified source",
  );
});
