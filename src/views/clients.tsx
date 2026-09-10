import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Control, Notice, PageTitle } from "@/components/common";
import { AuditTable, NewAudit } from "./audit-list";
export function Clients() {
  const { data, act, busy } = useStore();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [context, setContext] = useState(""),
    [error, setError] = useState("");
  if (!data) return null;
  return (
    <>
      <PageTitle title="Clients">
        {data.me.role === "admin" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>New client</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New client</DialogTitle>
                <DialogDescription>Add client context.</DialogDescription>
              </DialogHeader>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await act("create_client", { name, context });
                    setOpen(false);
                    setName("");
                    setContext("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Control label="Name">
                  {(id) => (
                    <Input
                      id={id}
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </Control>
                <Control label="Context">
                  {(id) => (
                    <Textarea
                      id={id}
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      maxLength={4000}
                    />
                  )}
                </Control>
                {error && <Notice>{error}</Notice>}
                <Button disabled={busy}>Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </PageTitle>
      <div className="client-list">
        {data.clients.map((c) => (
          <Link key={c.id} to="/clients/$clientId" params={{ clientId: c.id }}>
            <h2>{c.name}</h2>
            <p className="muted">{c.context || "No context."}</p>
            <span>
              {data.audits.filter((a) => a.client_id === c.id).length} audits ↗
            </span>
          </Link>
        ))}
      </div>
      {!data.clients.length && <div className="empty">No clients yet.</div>}
    </>
  );
}
export function ClientView({ clientId }: { clientId: string }) {
  const { data } = useStore();
  const client = data?.clients.find((c) => c.id === clientId);
  if (!data || !client) return <Notice>Client not found.</Notice>;
  return (
    <>
      <Link to="/clients" className="back">
        ← Clients
      </Link>
      <PageTitle title={client.name} subtitle={client.context}>
        <NewAudit clientId={client.id} />
      </PageTitle>
      <section className="panel">
        <h2>Team</h2>
        <div className="team">
          {data.members
            .filter((m) =>
              data.assignments.some(
                (x) => x.client_id === client.id && x.user_id === m.id,
              ),
            )
            .map((m) => (
              <span key={m.id}>
                {m.name}
                {!m.active ? " · Removed" : ""}
              </span>
            ))}
        </div>
      </section>
      <h2 className="section-title">Audits</h2>
      <AuditTable
        audits={data.audits.filter((a) => a.client_id === client.id)}
      />
    </>
  );
}
