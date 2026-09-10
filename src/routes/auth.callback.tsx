import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/auth/callback")({ component: Callback });
let exchange: { code: string; promise: Promise<boolean> } | undefined;
function Callback() {
  const { refresh } = useStore();
  const navigate = Route.useNavigate();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const code = new URL(location.href).searchParams.get("code");
    if (code && code !== exchange?.code) {
      history.replaceState({}, "", `${import.meta.env.BASE_URL}auth/callback`);
      exchange = {
        code,
        promise: supabase
          ? supabase.auth
              .exchangeCodeForSession(code)
              .then((r) => !r.error)
              .catch(() => false)
          : Promise.resolve(false),
      };
    }
    void (exchange?.promise ?? Promise.resolve(false)).then(async (ok) => {
      if (ok) {
        await refresh();
        await navigate({ to: "/" });
      } else setFailed(true);
    });
  }, [navigate, refresh]);
  return (
    <main className="login">
      <h1>{failed ? "Link expired." : "Signing in…"}</h1>
      {failed && (
        <Button asChild>
          <Link to="/login">Send another</Link>
        </Button>
      )}
    </main>
  );
}
