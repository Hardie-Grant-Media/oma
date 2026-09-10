import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, configured, isDemo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { Control, Notice } from "@/components/common";

export const Route = createFileRoute("/login")({ component: Login });
function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <main className="login">
      <Link className="wordmark" to="/">
        OMA<span>OWNED MEDIA AUDITOR</span>
      </Link>
      <h1>Sign in</h1>
      {!configured && !isDemo ? (
        <Notice>Connect Supabase to begin.</Notice>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (wait || busy) return;
            setBusy(true);
            try {
              await supabase?.auth.signInWithOtp({
                email: email.trim(),
                options: {
                  shouldCreateUser: false,
                  emailRedirectTo: `${location.origin}/auth/callback`,
                },
              });
            } catch {
              /* Keep generic responses, including network failures. */
            } finally {
              setSent(true);
              setWait(60);
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <Control label="Email">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
            </Control>
            <Button disabled={busy || wait > 0} type="submit">
              {busy ? "Sending…" : wait ? `Resend in ${wait}s` : "Send link"}
            </Button>
            {sent && (
              <p role="status" className="muted">
                If you have access, check your email.
              </p>
            )}
          </FieldGroup>
        </form>
      )}
      <p className="muted text-sm">Access by invitation.</p>
    </main>
  );
}
