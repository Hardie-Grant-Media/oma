import { parseDocument } from "htmlparser2";
import { findAll, removeElement, textContent } from "domutils";
import type { Evidence } from "./domain.ts";
export function safeHtmlText(html: string) {
  const doc = parseDocument(html, { decodeEntities: true });
  for (const node of findAll(
    (n) =>
      [
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "svg",
        "math",
        "template",
        "noscript",
      ].includes(n.name),
    doc.children,
  ))
    removeElement(node);
  for (const node of findAll(
    (n) =>
      [
        "p",
        "div",
        "li",
        "h1",
        "h2",
        "h3",
        "br",
        "tr",
        "td",
        "section",
        "article",
      ].includes(n.name),
    doc.children,
  ))
    node.children.push({
      type: "text",
      data: "\n",
      parent: node,
      prev: null,
      next: null,
    } as never);
  return textContent(doc)
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else throw new Error("Malformed CSV.");
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (rows.length > 20000) throw new Error("Split CSVs above 20,000 rows.");
  return rows;
}
export function textEvidence(text: string, e: Evidence) {
  if (e.mime === "text/html")
    return {
      text: safeHtmlText(text),
      facts: [
        "HTML appearance is unknown. Active content and embedded resources were not loaded.",
      ],
    };
  if (e.mime === "text/csv") {
    const rows = parseCsv(text);
    const dates = rows
      .slice(1)
      .flatMap((r) =>
        r.filter(
          (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)),
        ),
      )
      .sort();
    return {
      text: rows.map((r, i) => `Row ${i + 1}: ${JSON.stringify(r)}`).join("\n"),
      facts: [
        `${Math.max(0, rows.length - 1)} data rows; ${rows[0]?.length ?? 0} columns. First row treated as headers.`,
        ...(dates.length
          ? [
              `ISO date range: ${dates[0]} to ${dates.at(-1)}. Dates may describe different fields.`,
            ]
          : ["No unambiguous ISO dates."]),
      ],
    };
  }
  return {
    text: text
      .split(/\r?\n/)
      .map((line, i) => `Line ${i + 1}: ${line}`)
      .join("\n"),
    facts: ["Text alone does not establish visual appearance."],
  };
}
export function verifyBytes(bytes: Uint8Array, mime: string) {
  const starts = (n: number[]) => n.every((v, i) => bytes[i] === v);
  if (mime === "application/pdf" && !starts([37, 80, 68, 70, 45]))
    throw new Error("Invalid PDF.");
  if (mime === "image/png" && !starts([137, 80, 78, 71, 13, 10, 26, 10]))
    throw new Error("Invalid PNG.");
  if (mime === "image/jpeg" && !starts([255, 216, 255]))
    throw new Error("Invalid JPEG.");
  if (mime.startsWith("text/")) {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (bytes.includes(0)) throw new Error("Invalid text file.");
  }
}
