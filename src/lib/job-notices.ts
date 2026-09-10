import type { Audit, Job } from "../../supabase/functions/_shared/domain";

export function jobNotices(audit: Pick<Audit, "id" | "status">, jobs: Job[]) {
  // Completed drafts keep earlier failures in Admin, not as current blockers.
  if (audit.status === "Review" || audit.status === "Approved") return [];
  return jobs.filter((job) => job.audit_id === audit.id && job.error);
}
