import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  date,
} from "@/components/common";
import { type Audit } from "../../supabase/functions/_shared/domain";

export function NewAudit({ clientId }: { clientId?: string }) {
  const { data, act, busy } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [client, setClient] = useState(clientId ?? ""),
    [title, setTitle] = useState(""),
    [reviewer, setReviewer] = useState(""),
    [error, setError] = useState("");
  if (!data) return null;
  const team = data.members.filter(
    (m) =>
      m.active &&
      (m.role === "admin" ||
        data.assignments.some(
          (x) => x.client_id === client && x.user_id === m.id,
        )),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!data.clients.length}>
          <Plus />
          New audit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New audit</DialogTitle>
          <DialogDescription>Set the client and strategist.</DialogDescription>
        </DialogHeader>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await act("create_audit", {
                client_id: client,
                setup: {
                  title,
                  audience: "To confirm",
                  category: "To confirm",
                  period_start: new Date().toISOString().slice(0, 10),
                  period_end: new Date().toISOString().slice(0, 10),
                  channels: ["Website"],
                  strategist_id: reviewer,
                  pov_score: 3,
                  pov_rationale: "To confirm",
                },
              });
              setOpen(false);
              await navigate({
                to: "/audits/$auditId",
                params: { auditId: String(r.id) },
                search: { tab: "setup" },
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Choice
            label="Client"
            value={client}
            onChange={(v) => {
              setClient(v);
              setReviewer("");
            }}
            options={data.clients.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Control label="Title">
            {(id) => (
              <Input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            )}
          </Control>
          <Choice
            label="Strategist"
            value={reviewer}
            onChange={setReviewer}
            options={team.map((m) => ({ value: m.id, label: m.name }))}
          />
          {error && <Notice>{error}</Notice>}
          <Button disabled={busy || !client || !reviewer}>Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function AuditTable({ audits }: { audits: Audit[] }) {
  const { data } = useStore();
  if (!data) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Audit</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Strategist</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {audits.map((a) => (
          <TableRow key={a.id}>
            <TableCell>
              <Link
                className="table-link"
                to="/audits/$auditId"
                params={{ auditId: a.id }}
                search={{
                  tab:
                    a.status === "Draft"
                      ? "setup"
                      : a.status === "Approved"
                        ? "report"
                        : ["Review", "Assessing"].includes(a.status)
                          ? "review"
                          : "evidence",
                }}
              >
                {a.title}
              </Link>
            </TableCell>
            <TableCell className="muted">
              {data.clients.find((c) => c.id === a.client_id)?.name}
            </TableCell>
            <TableCell>
              <StatusBadge status={a.status} />
            </TableCell>
            <TableCell>
              {data.members.find((m) => m.id === a.setup.strategist_id)?.name ??
                "Unassigned"}
            </TableCell>
            <TableCell className="muted">{date(a.updated_at)}</TableCell>
            <TableCell>
              <ArrowUpRight size={15} aria-hidden />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export function AuditList() {
  const { data } = useStore();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All");
  if (!data) return null;
  const attention = data.audits.filter((a) =>
    ["Evidence review", "Review", "Paused", "Failed"].includes(a.status),
  );
  const shown = data.audits.filter(
    (a) =>
      (filter === "All" ||
        (filter === "Needs review"
          ? attention.includes(a)
          : a.status === filter)) &&
      `${a.title} ${data.clients.find((c) => c.id === a.client_id)?.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle title="Audits">
        <NewAudit />
      </PageTitle>
      <div className="metrics">
        <div>
          <span>In progress</span>
          <strong>
            {
              data.audits.filter(
                (a) => !["Approved", "Cancelled"].includes(a.status),
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Needs review</span>
          <strong>{attention.length}</strong>
        </div>
        <div>
          <span>Approved</span>
          <strong>
            {data.audits.filter((a) => a.status === "Approved").length}
          </strong>
        </div>
      </div>
      <div className="toolbar">
        <div className="filter-tabs" aria-label="Status">
          {["All", "Needs review", "Approved"].map((f) => (
            <Button
              key={f}
              variant={f === filter ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter(f)}
              aria-pressed={f === filter}
            >
              {f}
            </Button>
          ))}
        </div>
        <div className="search">
          <Search size={16} />
          <Input
            aria-label="Search audits"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {shown.length ? (
        <AuditTable audits={shown} />
      ) : (
        <div className="empty">
          {query || filter !== "All" ? "No matches." : "No audits yet."}
        </div>
      )}
      <div className="table-footer">
        {shown.length} audit{shown.length !== 1 ? "s" : ""}
        <span>Scores assess quality, not outcomes.</span>
      </div>
    </>
  );
}
