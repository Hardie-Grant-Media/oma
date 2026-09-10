import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type {
  OAuthAuthorizationDetails,
  OAuthGrant,
} from "@supabase/supabase-js";
import { supabase, snapshot } from "@/lib/api";
import { useStore } from "@/lib/store";
import {
  rememberAuthorization,
  clearAuthorization,
  mcpClientIds,
  safeOAuthRedirect,
} from "@/lib/mcp-auth";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common";
import { BrandCredit } from "@/components/brand-credit";

export const Route = createFileRoute("/auth/connect")({
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id:
      typeof search.authorization_id === "string"
        ? search.authorization_id
        : "",
  }),
  component: Connect,
});
function Connect() {
  const { authorization_id: id } = Route.useSearch();
  const { data: staff, loading } = useStore();
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(
    null,
  );
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (id) rememberAuthorization(id);
    setDetails(null);
    setReady(false);
    setError("");
    if (!staff || !supabase) return;
    let active = true;
    void (async () => {
      try {
        if (!mcpClientIds().length)
          throw new Error("ChatGPT connection is not enabled yet.");
        if (id) {
          if (!/^[A-Za-z0-9_-]{16,200}$/.test(id))
            throw new Error(
              "Invalid connection request. Start again from ChatGPT.",
            );
          const { data, error } =
            await supabase!.auth.oauth.getAuthorizationDetails(id);
          if (error || !data)
            throw new Error(
              "Connection request expired. Start again from ChatGPT.",
            );
          if (!active) return;
          if (!("authorization_id" in data)) {
            clearAuthorization();
            window.location.assign(safeOAuthRedirect(data.redirect_url));
            return;
          }
          if (!mcpClientIds().includes(data.client.id))
            throw new Error("This connection is not registered for OMA.");
          setDetails(data);
        } else {
          const { data, error } = await supabase!.auth.oauth.listGrants();
          if (error)
            throw new Error("Couldn't load your connections. Try again.");
          if (active)
            setGrants(
              (data ?? []).filter((g) => mcpClientIds().includes(g.client.id)),
            );
        }
        if (active) setReady(true);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, staff]);
  async function decide(approve: boolean) {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    try {
      // Refresh membership before granting access. MCP checks again on every call.
      if (!(await snapshot()).me.active)
        throw new Error("Staff access is required.");
      const { data, error } = await (approve
        ? supabase.auth.oauth.approveAuthorization(id, {
            skipBrowserRedirect: true,
          })
        : supabase.auth.oauth.denyAuthorization(id, {
            skipBrowserRedirect: true,
          }));
      if (error || !data)
        throw new Error(
          "Couldn't complete the connection. Start again from ChatGPT.",
        );
      clearAuthorization();
      window.location.assign(safeOAuthRedirect(data.redirect_url));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Link className="wordmark" to="/">
        OMA<span>OWNED MEDIA AUDITOR</span>
      </Link>
      <h1>{id ? "Connect ChatGPT" : "Your ChatGPT connection"}</h1>
      {loading ? (
        <p role="status">Checking staff access…</p>
      ) : !staff ? (
        <>
          <p>Sign in with your OMA staff account to continue.</p>
          <Button asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="muted">Signed in as {staff.me.name}.</p>
          {error && <Notice>{error}</Notice>}
          {details && (
            <div className="stack">
              <p>
                <strong>{details.client.name}</strong> wants to connect to your
                OMA account.
              </p>
              <p>
                It can read and manage your assigned clients, audits, evidence,
                reviews, reports and share links. Your existing role and
                approval rules apply.
              </p>
              {staff.me.role === "admin" && (
                <p>
                  As an administrator, you can also manage staff, assignments,
                  budgets and audit deletion through this connection.
                </p>
              )}
              <p>
                Requested identity access: {details.scope}. Changes happen under
                your OMA identity. You can disconnect here at any time.
              </p>
              <div className="actions">
                <Button disabled={busy} onClick={() => void decide(true)}>
                  {busy ? "Connecting…" : "Allow connection"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void decide(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {!id &&
            ready &&
            (grants.length ? (
              grants.map((grant) => (
                <div className="stack tight" key={grant.client.id}>
                  <strong>{grant.client.name}</strong>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        const { error } =
                          await supabase!.auth.oauth.revokeGrant({
                            clientId: grant.client.id,
                          });
                        if (error) throw error;
                        setGrants((current) =>
                          current.filter(
                            (g) => g.client.id !== grant.client.id,
                          ),
                        );
                        setNotice(
                          "Disconnected. ChatGPT can no longer access OMA through this connection.",
                        );
                      } catch {
                        setError("Couldn't disconnect. Try again.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              ))
            ) : (
              <p>
                No active ChatGPT connections. Start the connection from
                ChatGPT.
              </p>
            ))}
          {notice && <p role="status">{notice}</p>}
        </>
      )}
      <Button asChild variant="ghost">
        <Link to="/">Back to OMA</Link>
      </Button>
      <BrandCredit />
    </main>
  );
}
