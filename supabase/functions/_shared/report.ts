import {
  REPORT_VERSION,
  PRINCIPLES,
  confidenceLabel,
  channelTotal,
  totals,
  type Audit,
  type Evidence,
  type Revision,
} from "./domain.ts";
import { REPORT_CSS } from "./report-style.ts";

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
const definitions = {
  memory: "How recognisable and repeatable the content is over time.",
  credibility: "How well content is backed by evidence, expertise or proof.",
  consistency: "How reliably identity and structure repeat across content.",
  relevance: "How well content fits the audience, season and occasion.",
  feeling: "How much genuine emotional connection the content creates.",
};
function sourceUrl(source: string) {
  try {
    const url = new URL(source);
    return ["http:", "https:"].includes(url.protocol)
      ? escapeHtml(url.href)
      : null;
  } catch {
    return null;
  }
}
function dateLabel(value: string) {
  const date = new Date(value + "T00:00:00Z");
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}
/** Trusted, script-free template shared by preview and server-side export. */
export function renderReport(
  audit: Audit,
  revision: Revision,
  evidence: Evidence[],
  client: string,
) {
  if (!revision.assessment || !revision.report || !revision.calibration)
    throw new Error("Report is not ready.");
  const { assessment, report, calibration } = revision;
  const score = totals(assessment),
    e = escapeHtml;
  const title = (s: string) => s[0].toUpperCase() + s.slice(1);
  const number = (n: number) => String(n).padStart(2, "0");
  const section = (
    n: number,
    label: string,
    heading: string,
    body: string,
    tone = "",
    lede = "",
  ) =>
    '<section id="s' +
    n +
    '" class="section ' +
    tone +
    '" aria-labelledby="heading-' +
    n +
    '"><div class="wrap"><div class="section-head"><p class="eyebrow">' +
    number(n) +
    " · " +
    label +
    '</p><h2 id="heading-' +
    n +
    '">' +
    heading +
    "</h2>" +
    (lede ? '<p class="lede">' + lede + "</p>" : "") +
    "</div>" +
    body +
    "</div></section>";
  const claims = [...report.findings, ...report.needs, ...report.priorities];
  const ids = [
    ...new Set([
      ...assessment.adjustment_evidence_ids,
      ...claims.flatMap((c) => c.evidence_ids),
      ...assessment.channels.flatMap((c) =>
        PRINCIPLES.flatMap((p) => c.principles[p].evidence_ids),
      ),
    ]),
  ];
  const ref = (sourceIds: string[]) =>
    sourceIds
      .map(
        (id) =>
          ' <a class="ref" href="#source-' +
          encodeURIComponent(id) +
          '" aria-label="Source ' +
          (ids.indexOf(id) + 1) +
          '"><sup>[' +
          (ids.indexOf(id) + 1) +
          "]</sup></a>",
      )
      .join("");
  const sources = evidence
    .filter((f) => f.status === "Verified")
    .flatMap((f) =>
      f.observations
        .filter((o) => o.verified && ids.includes(o.id))
        .map((o) => {
          const url = sourceUrl(f.source);
          return (
            '<li id="source-' +
            e(o.id) +
            '"><b>[' +
            (ids.indexOf(o.id) + 1) +
            "] " +
            e(f.name) +
            " · " +
            e(o.locator) +
            "</b><p>" +
            e(o.text) +
            "</p>" +
            (url
              ? '<a href="' + url + '" rel="noreferrer">' + e(f.source) + "</a>"
              : "") +
            "</li>"
          );
        }),
    );
  const channels = assessment.channels.map((c) => c.channel).join(" · ");
  const confidence = Math.min(...assessment.channels.map((c) => c.confidence));
  const highest = Math.max(...assessment.channels.map((c) => c.confidence));
  const confidenceNote =
    confidence === highest
      ? (assessment.channels.length === 1
          ? "Assessed channel: "
          : "All assessed channels: ") +
        e(channels) +
        "."
      : "Highest: " +
        e(
          assessment.channels
            .filter((c) => c.confidence === highest)
            .map((c) => c.channel)
            .join(", "),
        ) +
        ". Lowest: " +
        e(
          assessment.channels
            .filter((c) => c.confidence === confidence)
            .map((c) => c.channel)
            .join(", "),
        ) +
        ". Overall confidence follows the lowest channel confidence.";
  const period =
    audit.setup.period_start === audit.setup.period_end
      ? dateLabel(audit.setup.period_start)
      : dateLabel(audit.setup.period_start) +
        " – " +
        dateLabel(audit.setup.period_end);
  const limitations = [
    ...new Set([...assessment.limitations, ...report.limitations]),
  ];
  const unassessed = audit.setup.channels.filter(
    (channel) => !assessment.channels.some((c) => c.channel === channel),
  );
  const coverage = unassessed.length
    ? '<p class="note">Excluded from scoring: ' +
      e(unassessed.join(" · ")) +
      ". Missing channels are not penalised.</p>"
    : "";
  const nav = [
    [1, "Findings"],
    [2, "Score"],
    [3, "Evidence"],
    [4, "Channels"],
    [5, "Heatmap"],
    [6, "Standards"],
    [7, "Deep dives"],
    [8, "Needs"],
    [9, "Priorities"],
    [10, "Scope"],
    [11, "Method"],
  ]
    .map(([n, label]) => '<a href="#s' + n + '">' + label + "</a>")
    .join("");
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="generator" content="OMA ' +
    REPORT_VERSION +
    '"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><title>' +
    e(client) +
    " · HeadWay Owned Media Audit</title><style>" +
    REPORT_CSS +
    "</style></head><body>" +
    '<a class="skip" href="#main">Skip to report</a><nav class="topnav" aria-label="Report sections"><div class="nav-wrap"><a class="brandmark" href="#main">OMA <span>HeadWay audit</span></a><div class="navlinks">' +
    nav +
    "</div></div></nav>" +
    '<main id="main"><header class="hero"><div class="wrap"><p class="eyebrow">HeadWay Owned Media Audit</p><h1>' +
    e(client) +
    '</h1><p class="subtitle">' +
    e(channels) +
    ' assessed against five HeadWay principles.</p><dl class="prepared-for"><div><dt>Prepared for</dt><dd>' +
    e(client) +
    "</dd></div><div><dt>Channels reviewed</dt><dd>" +
    e(channels) +
    '</dd></div><div><dt>Prepared by</dt><dd>Heads &amp; Tales</dd></div></dl><p class="meta">' +
    e(period) +
    " · " +
    (revision.approved_at ? "Approved" : "Draft") +
    " · Revision " +
    revision.version +
    "</p></div></header>" +
    section(
      1,
      "Topline findings",
      "Topline findings from the data",
      '<ul class="findings-list">' +
        report.findings
          .map((c) => "<li><p>" + e(c.text) + ref(c.evidence_ids) + "</p></li>")
          .join("") +
        "</ul>",
    ) +
    section(
      2,
      "Owned ecosystem score",
      "Owned ecosystem score",
      '<div class="score-grid"><div class="dial" role="img" aria-label="Owned ecosystem score: ' +
        score.display20 +
        ' out of 20"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="dial-track" cx="120" cy="120" r="106"/><circle class="dial-value" cx="120" cy="120" r="106" pathLength="100" stroke-dasharray="' +
        score.display20 * 5 +
        ' 100"/></svg><div class="dial-number"><span class="num">' +
        score.display20 +
        '</span><span class="den">Out of 20</span></div></div><div class="score-copy"><p class="band">' +
        e(score.band) +
        "</p><h3>" +
        e(report.headline) +
        '</h3><p class="conf-line"><b>Overall confidence: ' +
        confidenceLabel(confidence) +
        ".</b> " +
        confidenceNote +
        "</p>" +
        (assessment.channels.length === 1
          ? '<p class="note">' +
            e(channels) +
            " only. Cross-channel coherence is not assessed.</p>"
          : "") +
        "</div></div>",
      "dark",
    ) +
    section(
      3,
      "Confidence &amp; evidence reviewed",
      "What was reviewed, channel by channel",
      '<div class="table-scroll" role="region" aria-label="Evidence reviewed" tabindex="0"><table class="evtable"><thead><tr><th scope="col">Channel</th><th scope="col">Evidence reviewed</th><th scope="col">Evidence tier</th><th scope="col">Confidence</th></tr></thead><tbody>' +
        assessment.channels
          .map(
            (c) =>
              '<tr><th scope="row">' +
              e(c.channel) +
              "</th><td>" +
              e(c.evidence_reviewed) +
              '</td><td><span class="chip">' +
              e(c.tier) +
              '</span></td><td><span class="chip">' +
              confidenceLabel(c.confidence) +
              "</span></td></tr>",
          )
          .join("") +
        "</tbody></table></div>" +
        coverage +
        '<details class="sources" open><summary>Sources · ' +
        sources.length +
        "</summary><ul>" +
        sources.join("") +
        "</ul></details>",
    ) +
    section(
      4,
      "Channel comparison",
      "Channel snapshot",
      '<div class="bars">' +
        score.ranking
          .map(
            (c) =>
              '<div class="bar-row"><div class="bname">' +
              e(c.channel) +
              '</div><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:' +
              c.display20 * 5 +
              '%"></div></div><div class="bar-score">' +
              c.display20 +
              "<span> /20</span></div></div>",
          )
          .join("") +
        "</div>",
      "soft",
    ) +
    section(
      5,
      "Principle heatmap",
      "Where the evidence is strongest and thinnest",
      '<div class="table-scroll" role="region" aria-label="Principle scores" tabindex="0"><table class="heatmap"><thead><tr><th scope="col">Channel</th>' +
        PRINCIPLES.map((p) => '<th scope="col">' + title(p) + "</th>").join(
          "",
        ) +
        "</tr></thead><tbody>" +
        assessment.channels
          .map(
            (c) =>
              '<tr><th scope="row">' +
              e(c.channel) +
              "</th>" +
              PRINCIPLES.map(
                (p) =>
                  '<td><span class="heatcell s' +
                  c.principles[p].score +
                  '">' +
                  c.principles[p].score +
                  '<span class="sr-only"> out of 5</span></span></td>',
              ).join("") +
              "</tr>",
          )
          .join("") +
        '</tbody></table></div><div class="heat-legend">' +
        ["Weak", "Needs attention", "Adequate", "Strong", "Very strong"]
          .map(
            (label, i) =>
              '<span><i class="s' +
              (i + 1) +
              '" aria-hidden="true"></i>' +
              (i + 1) +
              " · " +
              label +
              "</span>",
          )
          .join("") +
        "</div>",
      "",
      "Each score is out of five. Confidence is shown separately.",
    ) +
    section(
      6,
      "What we’re measuring against",
      "What a five would mean for " + e(client),
      '<dl class="standards">' +
        PRINCIPLES.map(
          (p) =>
            "<div><dt>" +
            title(p) +
            "</dt><dd>" +
            e(calibration[p]) +
            "</dd></div>",
        ).join("") +
        "</dl>",
      "soft",
      "Full marks for this brand, audience and category.",
    ) +
    section(
      7,
      "Channel deep dives",
      "The evidence behind each score",
      assessment.channels
        .map(
          (c) =>
            '<details class="channel-card" open><summary><span class="summary-left"><span class="channel-name">' +
            e(c.channel) +
            '</span><span class="summary-tags"><span class="chip">' +
            e(c.tier) +
            ' evidence</span><span class="chip">' +
            confidenceLabel(c.confidence) +
            ' confidence</span></span></span><span class="summary-score">' +
            channelTotal(c).display20 +
            '<small> /20</small><span class="toggle" aria-hidden="true"></span></span></summary><div class="card-body"><p class="card-scope"><b>Evidence reviewed:</b> ' +
            e(c.evidence_reviewed) +
            "</p>" +
            PRINCIPLES.map(
              (p) =>
                '<div class="principle-row"><div class="principle-name"><h3>' +
                title(p) +
                " <span>" +
                c.principles[p].score +
                '/5</span></h3><div class="pscore-track" aria-hidden="true"><div style="width:' +
                c.principles[p].score * 20 +
                '%"></div></div><p class="meta">' +
                confidenceLabel(c.principles[p].confidence) +
                ' confidence</p></div><div class="principle-copy"><p><b class="lbl">Evidence</b>' +
                e(c.principles[p].rationale) +
                ref(c.principles[p].evidence_ids) +
                '</p><p class="improve"><b class="lbl">Next step</b>' +
                e(c.principles[p].next_step) +
                "</p></div></div>",
            ).join("") +
            "</div></details>",
        )
        .join(""),
    ) +
    section(
      8,
      "Strategic need signals",
      "What " + e(client) + " needs next",
      report.needs.length
        ? '<ol class="signal-list">' +
            report.needs
              .map(
                (c, i) =>
                  '<li><span class="signal-num" aria-hidden="true">' +
                  number(i + 1) +
                  "</span><div><h3>" +
                  e(c.category) +
                  "</h3><p>" +
                  e(c.text) +
                  ref(c.evidence_ids) +
                  "</p></div></li>",
              )
              .join("") +
            "</ol>"
        : "<p>No further needs established.</p>",
      "dark",
    ) +
    section(
      9,
      "Top three priorities",
      "Where to focus first",
      '<ol class="priority-grid">' +
        report.priorities
          .map(
            (c, i) =>
              '<li class="priority-card"><span class="pnum" aria-hidden="true">' +
              number(i + 1) +
              "</span><p>" +
              e(c.text) +
              ref(c.evidence_ids) +
              "</p></li>",
          )
          .join("") +
        "</ol>",
    ) +
    section(
      10,
      "Scope &amp; evidence limitations",
      "What this audit could not see",
      '<ul class="scope-list">' +
        limitations.map((v) => "<li>" + e(v) + "</li>").join("") +
        "</ul>" +
        coverage,
      "soft",
    ) +
    section(
      11,
      "Methodology",
      "How this audit was built",
      '<div class="method-box"><p>Supplied owned media is assessed against five HeadWay principles. Channel scores combine into an owned ecosystem score, with confidence based on the evidence reviewed.</p><p>A light sample is not weak content. Missing evidence lowers confidence or requires exclusion, not an assumed low score. Business outcomes and native video are not assessed.</p></div><dl class="principle-defs">' +
        PRINCIPLES.map(
          (p) =>
            "<div><dt>" +
            title(p) +
            "</dt><dd>" +
            definitions[p] +
            "</dd></div>",
        ).join("") +
        "</dl>",
    ) +
    '</main><footer><div class="wrap"><div class="footer-brand">Heads &amp; Tales<p>Strategic thinking for memorable owned media.</p></div><p class="meta">HeadWay Owned Media Audit<br>Prepared for ' +
    e(client) +
    "<br>Confidential · " +
    (revision.approved_at ? "Approved" : "Draft") +
    "</p></div></footer></body></html>"
  );
}
