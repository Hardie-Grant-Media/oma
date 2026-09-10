import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  FolderOpen,
  LayoutList,
  LogOut,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { isDemo, supabase } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Notice } from "./common";

export function Shell() {
  const { data, error, loading, notice } = useStore();
  const pathname = useLocation({ select: (l) => l.pathname });
  const basepath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = basepath && pathname.startsWith(basepath + "/") ? pathname.slice(basepath.length) : pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  if (path === "/login" || path.startsWith("/auth/")) return <Outlet />;
  if (loading)
    return (
      <main className="loading">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-48 w-full" />
        <span className="sr-only">Loading</span>
      </main>
    );
  if (!data)
    return (
      <main className="login">
        <div className="wordmark">
          OMA<span>OWNED MEDIA AUDITOR</span>
        </div>
        <Notice>{error}</Notice>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <Link to="/" className="wordmark" aria-label="OMA home">
          OMA<span>OWNED MEDIA AUDITOR</span>
        </Link>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            onClick={() => setMobileOpen(false)}
          >
            <LayoutList />
            Audits
          </Link>
          <Link to="/clients" onClick={() => setMobileOpen(false)}>
            <FolderOpen />
            Clients
          </Link>
          {data.me.role === "admin" && (
            <Link to="/admin" onClick={() => setMobileOpen(false)}>
              <SlidersHorizontal />
              Admin
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="account">
            <span className="initial">{data.me.name[0]}</span>
            <div>
              {data.me.name}
              <span>
                {data.me.role === "admin" ? "Administrator" : "Team member"}
              </span>
            </div>
          </div>
          {!isDemo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void supabase?.auth.signOut()}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          )}
          <small>Heads &amp; Tales</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Button
            variant="ghost"
            size="sm"
            className="mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
          >
            Menu
          </Button>
          <span>
            Workspace <span className="slash">/</span>{" "}
            {path.startsWith("/admin")
              ? "Admin"
              : path.startsWith("/clients")
                ? "Clients"
                : "Audits"}
          </span>
          <span className="topbar-note">
            {isDemo ? "Local preview · Synthetic data" : "Internal"}
          </span>
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <div className="save-status" role="status" aria-live="polite">
          {notice}
        </div>
      </div>
    </div>
  );
}
