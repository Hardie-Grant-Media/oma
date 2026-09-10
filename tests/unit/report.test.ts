import { describe, expect, it } from "vitest";
import { parseDocument } from "htmlparser2";
import { findAll, textContent } from "domutils";
import { fixture } from "../../src/lib/fixtures";
import { renderReport } from "../../supabase/functions/_shared/report";
import { REPORT_CSS } from "../../supabase/functions/_shared/report-style";
import { totals } from "../../supabase/functions/_shared/domain";

function sample() {
  const s = fixture(),
    a = s.audits[0],
    r = s.revisions[0];
  const evidence = s.evidence.filter((e) => e.audit_id === a.id);
  return {
    a,
    r,
    evidence,
    html: () => renderReport(a, r, evidence, "Test brand"),
  };
}

describe("Reference report contract", () => {
  it("preserves the eleven-section reference order and key presentation blocks", () => {
    const html = sample().html();
    const doc = parseDocument(html);
    const labels = findAll(
      (el) => el.name === "p" && el.attribs.class === "eyebrow",
      doc.children,
    )
      .slice(1)
      .map(textContent);
    expect(labels).toEqual([
      "01 · Topline findings",
      "02 · Owned ecosystem score",
      "03 · Confidence & evidence reviewed",
      "04 · Channel comparison",
      "05 · Principle heatmap",
      "06 · What we’re measuring against",
      "07 · Channel deep dives",
      "08 · Strategic need signals",
      "09 · Top three priorities",
      "10 · Scope & evidence limitations",
      "11 · Methodology",
    ]);
    for (const name of [
      "hero",
      "dial",
      "evtable",
      "bars",
      "heatmap",
      "standards",
      "channel-card",
      "signal-list",
      "priority-grid",
      "scope-list",
      "principle-defs",
    ])
      expect(html).toContain('class="' + name);
    expect(
      findAll((el) => el.attribs.class === "priority-card", doc.children),
    ).toHaveLength(3);
    expect(html).toContain('content="OMA oma-1.1.0"');
  });
  it("renders final scores without JavaScript and never changes assessments", () => {
    const { r, html } = sample();
    const before = structuredClone(r);
    expect(html()).toContain('class="num">' + totals(r.assessment!).display20);
    expect(html()).not.toMatch(/<script|@import|url\(|<link\s|<iframe|<img\s/);
    expect(r).toEqual(before);
  });
  it("uses only greyscale colours, no motion and offline fonts", () => {
    for (const match of REPORT_CSS.matchAll(/#([\da-f]{6}|[\da-f]{3})\b/gi)) {
      const hex = match[1];
      const parts =
        hex.length === 3
          ? [...hex]
          : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
      expect(new Set(parts).size).toBe(1);
    }
    expect(REPORT_CSS).not.toMatch(/gradient|animation|transition|url\(/);
    expect(REPORT_CSS).toContain("@media(max-width:700px)");
    expect(REPORT_CSS).toContain("@media print");
  });
  it("links every citation to its verified source without active source URLs", () => {
    const { evidence, html } = sample();
    evidence[0].source = "javascript:alert(1)";
    const doc = parseDocument(html());
    const elements = findAll(() => true, doc.children);
    const ids = new Set(elements.map((el) => el.attribs.id));
    for (const el of elements.filter(
      (el) => el.name === "a" && el.attribs.href?.startsWith("#"),
    ))
      expect(ids.has(decodeURIComponent(el.attribs.href.slice(1)))).toBe(true);
    expect(html()).not.toContain('href="javascript:');
    evidence[0].source = "https://example.com/evidence?a=1&b=2";
    expect(html()).toContain('href="https://example.com/evidence?a=1&amp;b=2"');
  });
  it("does not leak internal errors, predictions or reviewer fields", () => {
    const { a, r, evidence, html } = sample();
    a.setup.pov_rationale = "PRIVATE_PREDICTION";
    r.resolved_flags = { x: "PRIVATE_REVIEWER_NOTE" };
    evidence.push({
      ...evidence[0],
      id: "rejected",
      status: "Excluded",
      exclusion_reason: "INTERNAL_UPLOAD_ERROR",
    });
    for (const internal of [
      "PRIVATE_PREDICTION",
      "PRIVATE_REVIEWER_NOTE",
      "INTERNAL_UPLOAD_ERROR",
      "fixed ideal",
      "rubric_version",
    ])
      expect(html()).not.toContain(internal);
  });
  it("makes approval state and single-channel scope explicit", () => {
    const { r, html } = sample();
    r.approved_at = null;
    r.assessment!.channels = [r.assessment!.channels[0]];
    expect(html()).toContain("Draft");
    expect(html()).toContain("Cross-channel coherence is not assessed.");
    r.approved_at = "2026-09-09T00:00:00Z";
    expect(html()).toContain("Confidential · Approved");
    expect(html()).not.toContain("Confidential · Draft");
  });
});
