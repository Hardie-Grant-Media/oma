import { BrandCredit } from "@/components/brand-credit";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { Control, Notice } from "@/components/common";

export const Route = createFileRoute("/auth/password")({ component: Password });
function Password() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase?.auth
      .getUser()
      .then(({ data, error }) => {
        if (active) setReady(!error && Boolean(data.user));
      })
      .catch(() => {
        if (active) setReady(false);
      });
    if (!supabase) setReady(false);
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="login">
      <Link className="wordmark" to="/">
        OMA<span>OWNED MEDIA AUDITOR</span>
      </Link>
      <h1>{saved ? "Password saved" : "Set your password"}</h1>
      {saved ? (
        <>
          <p role="status">Your password is ready. Sign in to continue.</p>
          <Button asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </>
      ) : ready === null ? (
        <p role="status">Checking your link…</p>
      ) : !ready ? (
        <>
          <Notice>This link has expired. Request a new password link.</Notice>
          <Button asChild>
            <Link to="/login">Back to sign-in</Link>
          </Button>
        </>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            if (password !== confirm) {
              setError("Passwords don't match.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              if (!supabase) throw new Error("Unavailable");
              const { error } = await supabase.auth.updateUser({ password });
              if (error) throw error;
              setPassword("");
              setConfirm("");
              await supabase.auth.signOut({ scope: "local" });
              setSaved(true);
            } catch {
              setError(
                "Couldn't save your password. Use a different password or request a new link.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <p className="muted">
              Use at least 12 characters, ideally a unique passphrase.
            </p>
            <Control label="New password">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Control>
            <Control label="Confirm password">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirm}
                  disabled={busy}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              )}
            </Control>
            {error && <Notice>{error}</Notice>}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </FieldGroup>
        </form>
      )}
      <BrandCredit />
    </main>
  );
}
