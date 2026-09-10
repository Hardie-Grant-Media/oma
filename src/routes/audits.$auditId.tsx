import { createFileRoute } from "@tanstack/react-router";
import { AuditView } from "@/views/audit";
export const Route = createFileRoute("/audits/$auditId")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: ["setup", "evidence", "review", "report"].includes(String(s.tab))
      ? String(s.tab)
      : "setup",
  }),
  component: () => (
    <AuditView
      auditId={Route.useParams().auditId}
      tab={Route.useSearch().tab}
    />
  ),
});
