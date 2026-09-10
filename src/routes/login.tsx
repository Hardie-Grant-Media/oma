import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, configured, isDemo } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { Control, Notice } from "@/components/common";

export const Route = createFileRoute("/login")({ component: Login });
function Login() {
  const navigate = Route.useNavigate();
  const { refresh } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "reset" | "link">("password");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setPassword("");
    setSent(false);
    setError("");
  };
  return (
    <main className="login">
      <Link className="wordmark" to="/">
        OMA<span>OWNED MEDIA AUDITOR</span>
      </Link>
      <div className="stack tight">
        <h1>{mode === "reset" ? "Set your password" : "Welcome back"}</h1>
        <p className="muted">
          {mode === "reset"
            ? "We'll email you a link to set or reset your password."
            : "Sign in to your OMA workspace."}
        </p>
      </div>
      {!configured && !isDemo ? (
        <Notice>Connect Supabase to begin.</Notice>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || (mode !== "password" && wait)) return;
            setBusy(true);
            setError("");
            try {
              if (!supabase) throw new Error("Unavailable");
              if (mode === "password") {
                const { error } = await supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
                setPassword("");
                await refresh();
                await navigate({ to: "/" });
              } else {
                const callback = `${location.origin}${import.meta.env.BASE_URL}auth/callback`;
                if (mode === "reset") {
                  const { error } = await supabase.auth.resetPasswordForEmail(
                    email.trim(),
                    { redirectTo: `${callback}?next=password` },
                  );
                  if (error) throw error;
                } else {
                  const { error } = await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: {
                      shouldCreateUser: false,
                      emailRedirectTo: callback,
                    },
                  });
                  if (error) throw error;
                }
              }
            } catch {
              if (mode === "password")
                setError(
                  "Unable to sign in. Check your email and password, or try again shortly.",
                );
            } finally {
              if (mode !== "password") {
                setSent(true);
                setWait(60);
              }
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <Control label="Email">
              {(id) => (
                <Input
                  id={id}
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
              )}
            </Control>
            {mode === "password" && (
              <Control label="Password">
                {(id) => (
                  <Input
                    id={id}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                  />
                )}
              </Control>
            )}
            {error && <Notice>{error}</Notice>}
            <Button
              disabled={busy || (mode !== "password" && wait > 0)}
              type="submit"
            >
              {busy
                ? mode === "password"
                  ? "Signing in…"
                  : "Sending…"
                : mode === "password"
                  ? "Sign in"
                  : wait
                    ? `Resend in ${wait}s`
                    : "Send link"}
            </Button>
            {sent && (
              <p role="status" className="muted">
                If you have access, check your email. Open the link in this
                browser.
              </p>
            )}
          </FieldGroup>
        </form>
      )}
      <div className="stack tight">
        {mode === "password" ? (
          <>
            <Button
              variant="link"
              disabled={busy}
              onClick={() => changeMode("reset")}
            >
              Set or reset password
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => changeMode("link")}
            >
              Use an email link instead
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => changeMode("password")}
          >
            Back to password sign-in
          </Button>
        )}
      </div>
      <p className="muted text-sm">
        Access by invitation. Use your work email.
      </p>
    </main>
  );
}
