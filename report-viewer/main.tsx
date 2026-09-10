import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../src/components/ui/button";
import { Input } from "../src/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "../src/components/ui/field";
import "../src/styles.css";
import "./viewer.css";

const endpoint = import.meta.env.VITE_REPORT_READER_URL;
const reportPolicy =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'\">";
function Viewer() {
  const [html, setHtml] = useState(""),
    [status, setStatus] = useState("Opening report…"),
    [needsPassword, setNeedsPassword] = useState(false),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const [token, setToken] = useState(location.hash.slice(1));
  useEffect(() => {
    const changed = () => setToken(location.hash.slice(1));
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  async function load(pass: string, signal?: AbortSignal) {
    setBusy(true);
    setHtml("");
    setStatus("Opening report…");
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !endpoint) throw new Error();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pass }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
      });
      const data = await res.json();
      if (signal?.aborted) return;
      if (res.status === 401 && data.password_required === true) {
        setNeedsPassword(true);
        setStatus("Enter the password provided with this report.");
        return;
      }
      if (!res.ok || typeof data.html !== "string") throw new Error();
      const markup = data.html.includes("<head>")
        ? data.html.replace("<head>", "<head>" + reportPolicy)
        : reportPolicy + data.html;
      setHtml(markup);
      setNeedsPassword(false);
      setStatus("");
    } catch {
      if (!signal?.aborted)
        setStatus(
          "Report unavailable. Check the link and password, or ask the sender for a new link.",
        );
    } finally {
      if (!signal?.aborted) {
        setBusy(false);
        setPassword("");
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    setNeedsPassword(false);
    setPassword("");
    void load("", controller.signal);
    return () => controller.abort();
  }, [token]);
  return (
    <main className="shared-report">
      <header className="viewer-header">
        <strong>HGM</strong>
        <span>Owned Media Auditor</span>
        <span>Shared report</span>
      </header>
      {html ? (
        <iframe
          title="Approved report"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={html}
        />
      ) : (
        <section className="viewer-message">
          <h1>{needsPassword ? "Protected report" : "Shared report"}</h1>
          <p role="status">{status}</p>
          {needsPassword && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void load(password);
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="report-password">Password</FieldLabel>
                  <Input
                    autoFocus
                    id="report-password"
                    type="password"
                    autoComplete="off"
                    maxLength={72}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Button disabled={busy} type="submit">
                  {busy ? "Opening…" : "Open report"}
                </Button>
              </FieldGroup>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Viewer />);
