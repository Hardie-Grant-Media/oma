import { createRootRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Notice } from "@/components/common";
export const Route = createRootRoute({
  component: Shell,
  notFoundComponent: () => (
    <Notice>
      Page not found. <Link to="/">Audits</Link>
    </Notice>
  ),
  errorComponent: ({ error, reset }) => (
    <Notice>
      {error instanceof Error ? error.message : "Request failed."}{" "}
      <button onClick={reset}>Retry</button>
    </Notice>
  ),
});
