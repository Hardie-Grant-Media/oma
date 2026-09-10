import { useEffect, useRef, useState } from "react";
import { command, isDemo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, Copy } from "lucide-react";

type Share = {
  id: string;
  version: number;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  password_protected: boolean;
};
export function ReportSharing({
  auditId,
  version,
}: {
  auditId: string;
  version: number;
}) {
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [expiry, setExpiry] = useState("");
  const [shares, setShares] = useState<Share[]>([]),
    [url, setUrl] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  const reload = async () => {
    const result = await command("share_list", { audit_id: auditId });
    setShares(result.shares as Share[]);
    setLoaded(true);
  };
  useEffect(() => {
    if (!open) {
      setUrl("");
      setPassword("");
      setExpiry("");
      pending.current = null;
      setLoaded(false);
      return;
    }
    setNotice("");
    void reload().catch(() =>
      setNotice(
        "Report sharing is unavailable. Check that the sharing backend is configured.",
      ),
    );
  }, [open, auditId]);
  const create = async () => {
    setBusy(true);
    setNotice("");
    setUrl("");
    try {
      if (!pending.current) {
        const token = btoa(
          String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
        )
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "");
        pending.current = {
          audit_id: auditId,
          version,
          request_key: crypto.randomUUID(),
          token,
          password,
          expires_at: expiry ? new Date(expiry).toISOString() : null,
        };
      }
      const result = await command("share_create", pending.current);
      if (typeof result.url !== "string")
        throw new Error(
          "This link was revoked. Close this dialog and create a new link.",
        );
      setUrl(result.url);
      pending.current = null;
      setPassword("");
      setNotice("Link created. Copy it now; it cannot be retrieved later.");
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={isDemo}
          title={isDemo ? "Sharing requires the connected app." : undefined}
        >
          <Link data-icon="inline-start" />
          Share report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share revision {version}</DialogTitle>
          <DialogDescription>
            Anyone with the link and optional password can read this approved
            report. Revoking a link stops future access, but cannot remove saved
            copies.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="share-password">
                Password (optional)
              </FieldLabel>
              <Input
                id="share-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                value={password}
                disabled={busy || !!pending.current}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldDescription>
                At least 8 characters. Send it separately from the link.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="share-expiry">Expires (optional)</FieldLabel>
              <Input
                id="share-expiry"
                type="datetime-local"
                value={expiry}
                disabled={busy || !!pending.current}
                onChange={(e) => setExpiry(e.target.value)}
              />
              <FieldDescription>
                Your local time. Leave blank for no expiry.
              </FieldDescription>
            </Field>
            <Button type="submit" disabled={busy || !loaded}>
              {busy
                ? "Saving…"
                : pending.current
                  ? "Retry creating link"
                  : "Create link"}
            </Button>
          </FieldGroup>
        </form>
        {url && (
          <Field>
            <FieldLabel htmlFor="share-url">Private report link</FieldLabel>
            <Input
              id="share-url"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setNotice("Link copied."))
                  .catch(() => setNotice("Select and copy the link above."))
              }
            >
              <Copy data-icon="inline-start" />
              Copy link
            </Button>
          </Field>
        )}
        {notice && (
          <Alert>
            <AlertDescription role="status">{notice}</AlertDescription>
          </Alert>
        )}
        <section
          aria-label="Existing report links"
          className="flex max-h-52 flex-col gap-3 overflow-auto"
        >
          <h3>Existing links</h3>
          {loaded && !shares.length && <p>No links created.</p>}
          {shares.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3">
              <p>
                Revision {s.version} ·{" "}
                {s.revoked_at
                  ? "Revoked"
                  : s.expires_at && Date.parse(s.expires_at) <= Date.now()
                    ? "Expired"
                    : "Active"}
                <br />
                <small>
                  {new Date(s.created_at).toLocaleString()}
                  {s.password_protected ? " · Password protected" : ""}
                  {s.expires_at
                    ? ` · Expires ${new Date(s.expires_at).toLocaleString()}`
                    : " · No expiry"}
                </small>
              </p>
              {!s.revoked_at && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await command("share_revoke", {
                        audit_id: auditId,
                        share_id: s.id,
                      });
                      setUrl("");
                      await reload();
                      setNotice("Link revoked.");
                    } catch (e) {
                      setNotice((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
