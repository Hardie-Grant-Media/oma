import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Choice,
  Control,
  Notice,
  PageTitle,
  StatusBadge,
} from "@/components/common";
export function Admin() {
  const { data, act, busy } = useStore();
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [client, setClient] = useState(""),
    [audit, setAudit] = useState(""),
    [budget, setBudget] = useState("25"),
    [confirm, setConfirm] = useState(""),
    [note, setNote] = useState(""),
    [recoveries, setRecoveries] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  if (!data || data.me.role !== "admin")
    return <Notice>Admin required.</Notice>;
  const selected = data.audits.find((a) => a.id === audit);
  const run = async (action: string, payload: Record<string, unknown>) => {
    try {
      await act(action, payload);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageTitle title="Admin" />
      {error && <Notice>{error}</Notice>}
      <div className="admin-grid">
        <div>
          <section className="panel">
            <h2>Members</h2>
            {data.members.map((m) => (
              <div className="member-row" key={m.id}>
                <div>
                  {m.name}
                  <small>
                    {m.email} · {m.role}
                  </small>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || m.id === data.me.id}
                  onClick={() =>
                    void run("member", {
                      user_id: m.id,
                      name: m.name,
                      email: m.email,
                      role: m.role,
                      active: !m.active,
                    })
                  }
                >
                  {m.active ? "Remove" : "Restore"}
                </Button>
              </div>
            ))}
            <form
              className="stack section-title"
              onSubmit={(e) => {
                e.preventDefault();
                void run("provision", { name, email });
              }}
            >
              <div className="two-col">
                <Input
                  aria-label="Member name"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Input
                  aria-label="Member email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button disabled={busy} className="self-start">
                Add member
              </Button>
            </form>
          </section>
          <section className="panel">
            <h2>Assignments</h2>
            <Choice
              label="Client"
              value={client}
              onChange={setClient}
              options={data.clients.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
            {client &&
              data.members
                .filter((m) => m.active && m.role !== "admin")
                .map((m) => (
                  <label className="member-row" key={m.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={data.assignments.some(
                        (x) => x.client_id === client && x.user_id === m.id,
                      )}
                      onChange={(e) =>
                        void run("assign", {
                          client_id: client,
                          user_id: m.id,
                          assigned: e.target.checked,
                        })
                      }
                    />
                    {m.name}
                  </label>
                ))}
          </section>
          <section className="panel">
            <h2>Calibration</h2>
            {!data.ledger.length && (
              <p className="muted">Recorded on approval.</p>
            )}
            {data.ledger.map((l) => (
              <div className="member-row" key={l.id}>
                <div>
                  {data.audits.find((a) => a.id === l.audit_id)?.title} · v
                  {l.revision}
                  <small>{l.verdict}</small>
                </div>
                <span>
                  {l.pov} → {l.result} /5
                  <br />
                  <small>
                    Drift {l.gap > 0 ? "+" : ""}
                    {l.gap}
                  </small>
                </span>
              </div>
            ))}
          </section>
        </div>
        <div>
          <section className="panel stack">
            <h2>Audit controls</h2>
            <Choice
              label="Audit"
              value={audit}
              onChange={(v) => {
                setAudit(v);
                setBudget(
                  String(data.audits.find((a) => a.id === v)?.budget_usd ?? 25),
                );
                setConfirm("");
              }}
              options={data.audits.map((a) => ({
                value: a.id,
                label: a.title,
              }))}
            />
            {selected && (
              <>
                <p className="muted">
                  Spent ${Number(selected.spent_usd).toFixed(2)} · Reserved $
                  {Number(selected.reserved_usd).toFixed(2)}
                </p>
                <Control label="Budget · USD">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      max={25}
                      step=".01"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  )}
                </Control>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run("budget", {
                      audit_id: audit,
                      budget: Number(budget),
                    })
                  }
                >
                  Set budget
                </Button>
                <Control label="Feedback">
                  {(id) => (
                    <Textarea
                      id={id}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={4000}
                    />
                  )}
                </Control>
                <Button
                  variant="outline"
                  disabled={busy || !note.trim()}
                  onClick={() =>
                    void run("feedback", { audit_id: audit, note })
                  }
                >
                  Record feedback
                </Button>
                {data.feedback
                  .filter((f) => f.audit_id === audit)
                  .map((f) => (
                    <p key={f.id} className="muted">
                      {f.note}
                    </p>
                  ))}
                <details>
                  <summary>Delete audit</summary>
                  <div className="stack">
                    <p>
                      Permanent. Removes evidence, reports and provider files.
                    </p>
                    <Control label={`Type “${selected.title}”`}>
                      {(id) => (
                        <Input
                          id={id}
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                        />
                      )}
                    </Control>
                    <Button
                      disabled={busy || confirm !== selected.title}
                      onClick={() =>
                        void run("delete", { audit_id: audit, confirm })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </details>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Jobs</h2>
            {!data.jobs.length && <p className="muted">No jobs.</p>}
            {data.jobs
              .filter((j) => !audit || j.audit_id === audit)
              .map((j) => (
                <div className="member-row" key={j.id}>
                  <div className="capitalize">
                    {j.stage}
                    <small>
                      {j.attempts} attempts{j.error ? ` · ${j.error}` : ""}
                    </small>
                    {j.status === "Uncertain" && (
                      <div className="stack">
                        <small>Check provider logs. Request: {j.id}</small>
                        <Input
                          aria-label={`Response ID for ${j.id}`}
                          placeholder="resp_…"
                          value={recoveries[j.id] ?? ""}
                          onChange={(e) =>
                            setRecoveries({
                              ...recoveries,
                              [j.id]: e.target.value,
                            })
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !recoveries[j.id]}
                          onClick={() =>
                            void run("recover", {
                              audit_id: j.audit_id,
                              job_id: j.id,
                              response_id: recoveries[j.id],
                              reason:
                                "Response ID recovered from provider logs.",
                            })
                          }
                        >
                          Recover
                        </Button>
                      </div>
                    )}
                  </div>
                  <StatusBadge status={j.status} />
                </div>
              ))}
          </section>
          <section className="panel">
            <h2>AI usage</h2>
            {!data.usage?.length && <p className="muted">No provider calls.</p>}
            {data.usage
              ?.filter((u) => !audit || u.audit_id === audit)
              .map((u) => (
                <div className="member-row" key={u.id}>
                  <div className="capitalize">
                    {u.stage}
                    <small>{u.model}</small>
                  </div>
                  <span>
                    ${Number(u.charged_usd ?? u.reserved_usd).toFixed(4)}
                    <small>{u.closed_at ? "Charged" : "Reserved"}</small>
                  </span>
                </div>
              ))}
          </section>
        </div>
      </div>
    </>
  );
}
