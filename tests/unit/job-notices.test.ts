import { describe, expect, it } from "vitest";
import { jobNotices } from "../../src/lib/job-notices";
import type { Job } from "../../supabase/functions/_shared/domain";

const failed: Job = {
  id: "job",
  audit_id: "audit",
  stage: "calibration",
  status: "Failed",
  attempts: 1,
  error: "More evidence needed.",
  created_at: "2026-09-08",
};

describe("job notices", () => {
  it("does not label a completed draft or approved report as failed", () => {
    expect(jobNotices({ id: "audit", status: "Review" }, [failed])).toEqual([]);
    expect(jobNotices({ id: "audit", status: "Approved" }, [failed])).toEqual(
      [],
    );
    expect(failed.error).toBe("More evidence needed.");
  });
  it("retains unresolved evidence requests", () => {
    expect(
      jobNotices({ id: "audit", status: "Evidence review" }, [failed]),
    ).toEqual([failed]);
  });
  it("excludes other audits and jobs without errors", () => {
    expect(jobNotices({ id: "other", status: "Failed" }, [failed])).toEqual([]);
    expect(
      jobNotices({ id: "audit", status: "Failed" }, [
        { ...failed, error: null },
      ]),
    ).toEqual([]);
  });
});
