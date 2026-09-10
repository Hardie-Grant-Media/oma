import { ReportSharing } from "@/components/report-sharing";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LockKeyhole, ArrowDownToLine, FileText, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { downloadHtml, previewAsset, upload } from "@/lib/api";
import { jobNotices } from "@/lib/job-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Choice,
  Control,
  Notice,
  PageTitle,
  StatusBadge,
} from "@/components/common";
import {
  CHANNELS,
  PRINCIPLES,
  WEIGHTS,
  canApprove,
  confidenceLabel,
  copyFlags,
  reconcile,
  setupSchema,
  totals,
  type Audit,
  type Evidence,
  type Revision,
  type Setup,
  type Snapshot,
} from "../../supabase/functions/_shared/domain";
import { renderReport } from "../../supabase/functions/_shared/report";

export function AuditView({ auditId, tab }: { auditId: string; tab: string }) {
  const { data, act, busy } = useStore();
  const a = data?.audits.find((a) => a.id === auditId);
  if (!data || !a) return <Notice>Audit not found.</Notice>;
  const r = data.revisions.find(
    (r) => r.audit_id === a.id && r.version === a.revision,
  )!;
  const evidence = data.evidence.filter((e) => e.audit_id === a.id);
  return (
    <>
      <Link to="/" className="back">
        ← Audits
      </Link>
      <PageTitle
        title={a.title}
        subtitle={`${data.clients.find((c) => c.id === a.client_id)?.name} · Revision ${a.revision}`}
      >
        <StatusBadge status={a.status} />
        {["Processing", "Assessing", "Paused", "Failed"].includes(a.status) && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void act("cancel", { audit_id: a.id }).catch(() => {})
            }
          >
            Cancel
          </Button>
        )}
        {["Paused", "Failed"].includes(a.status) && (
          <Button
            disabled={busy}
            onClick={() =>
              void act("retry", { audit_id: a.id }).catch(() => {})
            }
          >
            Retry
          </Button>
        )}
      </PageTitle>
      <div className="audit-tabs" role="navigation" aria-label="Audit">
        {["setup", "evidence", "review", "report"].map((t) => (
          <Link
            key={t}
            to="/audits/$auditId"
            params={{ auditId: a.id }}
            search={{ tab: t }}
            className={tab === t ? "selected" : ""}
            aria-current={tab === t ? "page" : undefined}
          >
            {t[0].toUpperCase() + t.slice(1)}
            {t === "evidence" && <span>{evidence.length}</span>}
          </Link>
        ))}
        <span className="budget">
          US${Number(a.spent_usd).toFixed(2)} / $
          {Number(a.budget_usd).toFixed(0)}
        </span>
      </div>
      {tab === "setup" ? (
        <SetupView key={`${a.id}-${a.updated_at}`} a={a} data={data} />
      ) : tab === "evidence" ? (
        <EvidenceView a={a} evidence={evidence} />
      ) : tab === "review" ? (
        <ReviewView key={r.id} a={a} r={r} evidence={evidence} />
      ) : (
        <ReportView a={a} r={r} evidence={evidence} data={data} />
      )}
      {jobNotices(a, data.jobs).map((j) => (
        <div className="job-notice" key={j.id}>
          <Notice>
            {j.stage}: {j.error}
          </Notice>
        </div>
      ))}
    </>
  );
}
function SetupView({ a, data }: { a: Audit; data: Snapshot }) {
  const { act, busy } = useStore();
  const [form, setForm] = useState(a.setup),
    [error, setError] = useState("");
  const locked =
    !!a.pov_locked_at || !["Draft", "Evidence review"].includes(a.status);
  const set = <K extends keyof Setup>(key: K, value: Setup[K]) =>
    setForm({ ...form, [key]: value });
  return (
    <form
      className="setup-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await act("setup", {
            audit_id: a.id,
            revision: a.revision,
            setup: setupSchema.parse(form),
          });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <div className="stack">
        <div className="section-intro">
          <h2>Scope</h2>
          {locked && (
            <span className="muted">
              <LockKeyhole size={14} />
              Locked
            </span>
          )}
        </div>
        <Control label="Title">
          {(id) => (
            <Input
              id={id}
              value={form.title}
              disabled={locked}
              onChange={(e) => set("title", e.target.value)}
              required
            />
          )}
        </Control>
        <Control label="Audience">
          {(id) => (
            <Textarea
              id={id}
              disabled={locked}
              value={form.audience}
              onChange={(e) => set("audience", e.target.value)}
              required
            />
          )}
        </Control>
        <Control label="Category">
          {(id) => (
            <Input
              id={id}
              disabled={locked}
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              required
            />
          )}
        </Control>
        <div className="two-col">
          {(["period_start", "period_end"] as const).map((key, i) => (
            <Control key={key} label={i ? "To" : "From"}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  disabled={locked}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  required
                />
              )}
            </Control>
          ))}
        </div>
        <fieldset>
          <legend>Channels</legend>
          <div className="channel-options">
            {CHANNELS.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={form.channels.includes(c)}
                  disabled={locked}
                  onChange={(e) =>
                    set(
                      "channels",
                      e.target.checked
                        ? [...form.channels, c]
                        : form.channels.filter((x) => x !== c),
                    )
                  }
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="stack pov-panel">
        <h2>Strategist POV</h2>
        <p className="muted">Locked before scoring. Hidden from AI.</p>
        <Choice
          label="Strategist"
          disabled={locked}
          value={form.strategist_id}
          onChange={(v) => set("strategist_id", v)}
          options={data.members
            .filter(
              (m) =>
                m.active &&
                (m.role === "admin" ||
                  data.assignments.some(
                    (x) => x.client_id === a.client_id && x.user_id === m.id,
                  )),
            )
            .map((m) => ({ value: m.id, label: m.name }))}
        />
        <Control label="Prediction /5">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={5}
              step={0.1}
              disabled={locked}
              value={form.pov_score}
              onChange={(e) => set("pov_score", Number(e.target.value))}
              required
            />
          )}
        </Control>
        <Control label="Rationale">
          {(id) => (
            <Textarea
              id={id}
              disabled={locked}
              rows={5}
              value={form.pov_rationale}
              onChange={(e) => set("pov_rationale", e.target.value)}
              required
            />
          )}
        </Control>
        {error && <Notice>{error}</Notice>}
        {!locked && (
          <Button disabled={busy} className="self-start">
            Save
          </Button>
        )}
      </div>
    </form>
  );
}
function EvidenceView({ a, evidence }: { a: Audit; evidence: Evidence[] }) {
  const { act, busy, refresh } = useStore();
  const [channel, setChannel] = useState<string>(a.setup.channels[0]),
    [captured, setCaptured] = useState(a.setup.period_end),
    [source, setSource] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [reason, setReason] = useState("");
  const locked = !["Draft", "Evidence review"].includes(a.status);
  const base = { audit_id: a.id, revision: a.revision };
  const add = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      await upload(file, { ...base, channel, captured_at: captured, source });
      await refresh();
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="evidence-grid">
      <div>
        <div className="section-intro">
          <h2>Evidence pack</h2>
          <span className="muted">
            {evidence.filter((e) => e.status === "Verified").length} /{" "}
            {evidence.length} verified
          </span>
        </div>
        {!evidence.length && <div className="empty">Add source material.</div>}
        {evidence.map((e) => (
          <EvidenceItem
            key={`${e.id}-${e.status}`}
            e={e}
            locked={locked}
            base={base}
          />
        ))}
        <div className="actions section-title">
          <Button
            disabled={
              busy || locked || !evidence.some((e) => e.status === "Ready")
            }
            onClick={() => void act("extract", base).catch(() => {})}
          >
            Extract
          </Button>
          <Button
            variant="outline"
            disabled={
              busy ||
              a.status !== "Evidence review" ||
              !evidence.some((e) => e.status === "Verified") ||
              evidence.some((e) => !["Verified", "Excluded"].includes(e.status))
            }
            onClick={() => void act("assess", base).catch(() => {})}
          >
            <LockKeyhole />
            Lock POV &amp; assess
          </Button>
        </div>
      </div>
      <div className="stack upload-panel">
        <h2>Upload</h2>
        <p className="muted">
          PDF, image, CSV, HTML or text.
          <br />
          20 MB PDF/image. 2 MB text. 50 files.
        </p>
        <Choice
          label="Channel"
          value={channel}
          onChange={setChannel}
          disabled={locked}
          options={a.setup.channels.map((c) => ({ value: c, label: c }))}
        />
        <Control label="Source">
          {(id) => (
            <Input
              id={id}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={locked}
              placeholder="URL or origin"
            />
          )}
        </Control>
        <Control label="Date">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={captured}
              onChange={(e) => setCaptured(e.target.value)}
              disabled={locked}
            />
          )}
        </Control>
        <Control label="File">
          {(id) => (
            <Input
              id={id}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.csv,.html,.htm,.txt"
              disabled={locked || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void add(file);
                e.target.value = "";
              }}
            />
          )}
        </Control>
        <Control label="Or paste text">
          {(id) => (
            <Textarea
              id={id}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              disabled={locked}
            />
          )}
        </Control>
        <Button
          variant="outline"
          disabled={locked || uploading || !text.trim()}
          onClick={() =>
            void add(
              new File([text], "Pasted text.txt", { type: "text/plain" }),
            )
          }
        >
          {uploading ? "Uploading…" : "Add text"}
        </Button>
        <details>
          <summary>Exclude missing channel</summary>
          <div className="stack">
            <Input
              aria-label="Exclusion reason"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={locked || reason.trim().length < 3}
              onClick={() =>
                void act("exclude", { ...base, channel, reason }).catch(
                  () => {},
                )
              }
            >
              Exclude {channel}
            </Button>
          </div>
        </details>
        {error && <Notice>{error}</Notice>}
      </div>
    </div>
  );
}
function EvidenceItem({
  e,
  locked,
  base,
}: {
  e: Evidence;
  locked: boolean;
  base: Record<string, unknown>;
}) {
  const { act, busy } = useStore();
  const [obs, setObs] = useState(e.observations),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <details className="evidence-item">
      <summary>
        <FileText size={18} />
        <div>
          <strong>{e.name}</strong>
          <span>
            {e.channel} · {e.captured_at}
          </span>
        </div>
        <StatusBadge status={e.status} />
      </summary>
      <div className="stack">
        <p className="muted">{e.source || "No source recorded."}</p>
        {e.bytes > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={async () => {
              try {
                if (preview) URL.revokeObjectURL(preview);
                setPreview(await previewAsset({ ...base, asset_id: e.id }));
              } catch {
                setPreview("");
              }
            }}
          >
            Preview
          </Button>
        )}
        {preview &&
          (e.mime.startsWith("image/") ? (
            <img className="source-image" src={preview} alt={e.name} />
          ) : e.mime === "application/pdf" ? (
            <iframe
              title={e.name}
              src={preview}
              sandbox=""
              className="source-frame"
            />
          ) : (
            <p>Text appears below. Active HTML is never rendered.</p>
          ))}
        {e.exclusion_reason && <Notice>{e.exclusion_reason}</Notice>}
        {obs.map((o, i) => (
          <div className="observation" key={o.id}>
            <div className="source-ref">
              {o.locator}
              <code>{o.id}</code>
            </div>
            <Textarea
              aria-label={`Observation ${i + 1}`}
              value={o.text}
              disabled={locked}
              onChange={(event) =>
                setObs(
                  obs.map((x, n) =>
                    n === i ? { ...x, text: event.target.value } : x,
                  ),
                )
              }
            />
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={o.verified}
                onChange={(event) =>
                  setObs(
                    obs.map((x, n) =>
                      n === i ? { ...x, verified: event.target.checked } : x,
                    ),
                  )
                }
              />
              Verified
            </label>
          </div>
        ))}
        {e.limitations.map((l, i) => (
          <p key={i} className="muted">
            {l}
          </p>
        ))}
        {!locked && ["Extracted", "Verified"].includes(e.status) && (
          <Button
            className="self-start"
            disabled={busy || !obs.length || obs.some((o) => !o.verified)}
            onClick={() =>
              void act("verify_evidence", {
                ...base,
                asset_id: e.id,
                observations: obs,
                limitations: e.limitations,
              }).catch(() => {})
            }
          >
            <Check />
            Save verification
          </Button>
        )}
        {!locked && e.status !== "Excluded" && (
          <div className="actions">
            <Input
              aria-label={`Exclude ${e.name}: reason`}
              placeholder="Exclusion reason"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                void act("exclude", { ...base, asset_id: e.id, reason }).catch(
                  () => {},
                )
              }
            >
              Exclude
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
function ReviewView({
  a,
  r,
  evidence,
}: {
  a: Audit;
  r: Revision;
  evidence: Evidence[];
}) {
  const { act, busy } = useStore();
  const [assessment, setAssessment] = useState(r.assessment),
    [report, setReport] = useState(r.report),
    [flags, setFlags] = useState(r.resolved_flags),
    [reason, setReason] = useState(""),
    [refs, setRefs] = useState(""),
    [selected, setSelected] = useState(0),
    [error, setError] = useState("");
  if (!assessment || !report)
    return (
      <div className="empty">
        {a.status === "Assessing"
          ? "Assessment in progress."
          : "Verify evidence, then assess."}
      </div>
    );
  const score = totals(assessment),
    pov = reconcile(assessment, a.setup.pov_score),
    c = assessment.channels[selected];
  const editable = ["Review", "Approved"].includes(a.status);
  return (
    <>
      <div className="review-summary">
        <div>
          <span className="eyebrow">ECOSYSTEM</span>
          <div className="big-score">
            {score.display20}
            <span>/20</span>
          </div>
          <p>{score.band}</p>
        </div>
        <div>
          <span className="eyebrow">STRATEGIST POV</span>
          <strong>
            {pov.pov} → {pov.result}
            <small> /5</small>
          </strong>
          <p>
            {pov.verdict} · {pov.gap > 0 ? "+" : ""}
            {pov.gap}
          </p>
        </div>
        <div>
          <span className="eyebrow">EVIDENCE</span>
          <strong>
            {evidence.filter((e) => e.status === "Verified").length}
            <small> files</small>
          </strong>
          <p>{assessment.channels.length} assessed channels</p>
        </div>
      </div>
      <section className="panel heatmap">
        <h2>Channel scores</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              {PRINCIPLES.map((p) => (
                <TableHead key={p} className="capitalize">
                  {p}
                  <small>{WEIGHTS[p] * 100}%</small>
                </TableHead>
              ))}
              <TableHead>/20</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assessment.channels.map((ch, i) => (
              <TableRow key={ch.channel}>
                <TableCell>
                  <Button variant="link" onClick={() => setSelected(i)}>
                    {ch.channel}
                  </Button>
                </TableCell>
                {PRINCIPLES.map((p) => (
                  <TableCell key={p}>
                    <span
                      className={`score-cell score-${ch.principles[p].score}`}
                    >
                      {ch.principles[p].score}
                      <span className="sr-only"> out of 5</span>
                    </span>
                  </TableCell>
                ))}
                <TableCell>
                  <strong>{score.channels[i].display20}</strong>
                </TableCell>
                <TableCell>
                  {confidenceLabel(ch.confidence)}
                  <small>{ch.tier} evidence</small>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <div className="review-grid">
        <section className="stack">
          <div className="section-intro">
            <h2>{c.channel}</h2>
            <span className="muted">{c.evidence_reviewed}</span>
          </div>
          {PRINCIPLES.map((p) => (
            <details className="principle" key={`${c.channel}-${p}`}>
              <summary>
                <span className="capitalize">{p}</span>
                <strong>{c.principles[p].score}/5</strong>
              </summary>
              <div className="stack">
                <p className="muted">Standard: {r.calibration?.[p]}</p>
                <p className="muted">
                  {confidenceLabel(c.principles[p].confidence)} confidence
                </p>
                {(["rationale", "next_step"] as const).map((field) => (
                  <Control
                    key={field}
                    label={field === "rationale" ? "Rationale" : "Next step"}
                  >
                    {(id) => (
                      <Textarea
                        id={id}
                        disabled={!editable}
                        value={c.principles[p][field]}
                        onChange={(e) =>
                          setAssessment({
                            ...assessment,
                            channels: assessment.channels.map((ch, i) =>
                              i === selected
                                ? {
                                    ...ch,
                                    principles: {
                                      ...ch.principles,
                                      [p]: {
                                        ...ch.principles[p],
                                        [field]: e.target.value,
                                      },
                                    },
                                  }
                                : ch,
                            ),
                          })
                        }
                      />
                    )}
                  </Control>
                ))}
                <Control label="Source IDs">
                  {(id) => (
                    <Input
                      id={id}
                      disabled={!editable}
                      value={c.principles[p].evidence_ids.join(", ")}
                      onChange={(e) =>
                        setAssessment({
                          ...assessment,
                          channels: assessment.channels.map((ch, i) =>
                            i === selected
                              ? {
                                  ...ch,
                                  principles: {
                                    ...ch.principles,
                                    [p]: {
                                      ...ch.principles[p],
                                      evidence_ids: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    },
                                  },
                                }
                              : ch,
                          ),
                        })
                      }
                    />
                  )}
                </Control>
                <div className="citations">
                  {c.principles[p].evidence_ids.map((id) => {
                    const o = evidence
                      .flatMap((e) => e.observations)
                      .find((o) => o.id === id);
                    return (
                      <blockquote key={id}>
                        <code>{id}</code>
                        <p>{o?.text ?? "Missing source"}</p>
                        <span>{o?.locator}</span>
                      </blockquote>
                    );
                  })}
                </div>
                <Control label="Score /5">
                  {(id) => (
                    <Input
                      id={id}
                      disabled={!editable}
                      type="number"
                      min={1}
                      max={5}
                      value={c.principles[p].score}
                      onChange={(e) =>
                        setAssessment({
                          ...assessment,
                          channels: assessment.channels.map((ch, i) =>
                            i === selected
                              ? {
                                  ...ch,
                                  principles: {
                                    ...ch.principles,
                                    [p]: {
                                      ...ch.principles[p],
                                      score: Math.max(
                                        1,
                                        Math.min(
                                          5,
                                          Math.round(Number(e.target.value)),
                                        ),
                                      ),
                                    },
                                  },
                                }
                              : ch,
                          ),
                        })
                      }
                    />
                  )}
                </Control>
              </div>
            </details>
          ))}
          <details className="principle">
            <summary>Ecosystem adjustment · {assessment.adjustment}</summary>
            <div className="stack">
              <Choice
                label="Adjustment"
                disabled={!editable}
                value={String(assessment.adjustment)}
                onChange={(v) =>
                  setAssessment({ ...assessment, adjustment: Number(v) })
                }
                options={[-1, 0, 1].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
              />
              <Control label="Adjustment reason">
                {(id) => (
                  <Textarea
                    id={id}
                    value={assessment.adjustment_reason}
                    disabled={!editable}
                    onChange={(e) =>
                      setAssessment({
                        ...assessment,
                        adjustment_reason: e.target.value,
                      })
                    }
                  />
                )}
              </Control>
              <Control label="Adjustment source IDs">
                {(id) => (
                  <Input
                    id={id}
                    value={assessment.adjustment_evidence_ids.join(", ")}
                    disabled={!editable}
                    onChange={(e) =>
                      setAssessment({
                        ...assessment,
                        adjustment_evidence_ids: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                )}
              </Control>
            </div>
          </details>
          <Control label="Correction reason">
            {(id) => (
              <Textarea
                id={id}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required for score changes"
              />
            )}
          </Control>
          <Control label="Correction source IDs">
            {(id) => (
              <Input
                id={id}
                value={refs}
                onChange={(e) => setRefs(e.target.value)}
                placeholder="Comma-separated IDs"
              />
            )}
          </Control>
        </section>
        <section className="stack">
          <h2>Report copy</h2>
          <Control label="Finding">
            {(id) => (
              <Textarea
                id={id}
                value={report.headline}
                disabled={!editable}
                onChange={(e) =>
                  setReport({ ...report, headline: e.target.value })
                }
              />
            )}
          </Control>
          {(["findings", "needs", "priorities"] as const).map((key) => (
            <div className="stack" key={key}>
              <h3 className="capitalize">{key}</h3>
              {report[key].map((claim, i) => (
                <div key={i} className="stack tight">
                  <Textarea
                    aria-label={`${key} ${i + 1}`}
                    value={claim.text}
                    disabled={!editable}
                    onChange={(e) =>
                      setReport({
                        ...report,
                        [key]: report[key].map((x, n) =>
                          n === i ? { ...x, text: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`${key} ${i + 1} source IDs`}
                    value={claim.evidence_ids.join(", ")}
                    disabled={!editable}
                    onChange={(e) =>
                      setReport({
                        ...report,
                        [key]: report[key].map((x, n) =>
                          n === i
                            ? {
                                ...x,
                                evidence_ids: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
          <Control label="Report limitations">
            {(id) => (
              <Textarea
                id={id}
                value={report.limitations.join("\n")}
                disabled={!editable}
                onChange={(e) =>
                  setReport({
                    ...report,
                    limitations: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
            )}
          </Control>
          {copyFlags(report).map((f) => (
            <Control key={f.id} label={`${f.reason} ${f.text}`}>
              {(id) => (
                <Input
                  id={id}
                  value={flags[f.id] ?? ""}
                  onChange={(e) =>
                    setFlags({ ...flags, [f.id]: e.target.value })
                  }
                  placeholder="Reason to retain"
                />
              )}
            </Control>
          ))}
          {Math.abs(pov.gap) > 1 && (
            <Control label="POV difference">
              {(id) => (
                <Textarea
                  id={id}
                  value={flags.divergence ?? ""}
                  onChange={(e) =>
                    setFlags({ ...flags, divergence: e.target.value })
                  }
                  placeholder="Explain the difference"
                />
              )}
            </Control>
          )}
        </section>
      </div>
      <div className="review-footer">
        <span className="muted">
          {a.status === "Approved"
            ? "Saving creates a new draft."
            : "Original AI scores are retained."}
        </span>
        <Button
          disabled={busy || !editable}
          onClick={async () => {
            try {
              await act("save_review", {
                audit_id: a.id,
                revision: a.revision,
                assessment,
                report,
                resolved_flags: flags,
                reason,
                evidence_ids: refs
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Save revision
        </Button>
      </div>
      {error && <Notice>{error}</Notice>}
    </>
  );
}
function ReportView({
  a,
  r,
  evidence,
  data,
}: {
  a: Audit;
  r: Revision;
  evidence: Evidence[];
  data: Snapshot;
}) {
  const { act, busy } = useStore();
  const [version, setVersion] = useState(String(r.version)),
    [error, setError] = useState("");
  const revision =
    data.revisions.find(
      (x) => x.audit_id === a.id && String(x.version) === version,
    ) ?? r;
  if (!revision.report || !revision.assessment || !revision.calibration)
    return <div className="empty">Report follows assessment.</div>;
  let reason = "";
  try {
    canApprove(a, r, data.me, evidence);
  } catch (e) {
    reason = (e as Error).message;
  }
  const html = renderReport(
    a,
    revision,
    evidence,
    data.clients.find((c) => c.id === a.client_id)!.name,
  );
  return (
    <>
      <div className="report-toolbar">
        <Choice
          label="Revision"
          value={version}
          onChange={setVersion}
          options={data.revisions
            .filter((x) => x.audit_id === a.id)
            .map((x) => ({
              value: String(x.version),
              label: `Revision ${x.version}${x.approved_at ? " · Approved" : " · Draft"}`,
            }))}
        />
        <div className="actions">
          {revision.approved_at && <ReportSharing key={revision.id} auditId={a.id} version={revision.version} />}
          {revision.approved_at ? (
            <Button
              disabled={busy}
              onClick={async () => {
                try {
                  const result = await act("export", {
                    audit_id: a.id,
                    revision: a.revision,
                    version: revision.version,
                  });
                  if (typeof result.html !== "string")
                    throw new Error("Export unavailable.");
                  downloadHtml(result.html, a.title);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <ArrowDownToLine />
              Download HTML
            </Button>
          ) : (
            <Button
              disabled={busy || !!reason || revision.version !== a.revision}
              title={reason}
              onClick={() =>
                void act("approve", {
                  audit_id: a.id,
                  revision: a.revision,
                }).catch(() => {})
              }
            >
              <Check />
              Approve
            </Button>
          )}
        </div>
      </div>
      {!revision.approved_at && reason && (
        <p className="muted report-note">{reason}</p>
      )}
      {error && <Notice>{error}</Notice>}
      <iframe
        className="report-preview"
        title="Report preview"
        sandbox=""
        srcDoc={html}
      />
      <details className="revision-history">
        <summary>Revision history</summary>
        {data.revisions
          .filter((x) => x.audit_id === a.id)
          .map((x) => (
            <p key={x.id}>
              v{x.version} · {x.approved_at ? "Approved" : "Draft"}
              {x.changes.at(-1)?.reason ? ` · ${x.changes.at(-1)?.reason}` : ""}
            </p>
          ))}
      </details>
    </>
  );
}
