import { z } from "zod";
import {
  CHANNELS,
  assessmentSchema,
  extractionSchema,
  reportSchema,
  setupSchema,
} from "./domain.ts";
import { sharePassword, shareToken } from "./sharing.ts";
const uuid = z.string().uuid(),
  short = z.string().trim().min(1).max(120);
export const base = z.object({
  audit_id: uuid,
  revision: z.number().int().positive(),
});
export const schemas = {
  create_client: z.object({
    name: short,
    context: z.string().max(4000).default(""),
  }),
  create_audit: z.object({ client_id: uuid, setup: setupSchema }),
  setup: base.extend({ setup: setupSchema }),
  provision: z.object({ name: short, email: z.email() }),
  member: z.object({
    user_id: uuid,
    name: short,
    email: z.email(),
    role: z.enum(["admin", "member"]),
    active: z.boolean(),
  }),
  assign: z.object({ client_id: uuid, user_id: uuid, assigned: z.boolean() }),
  reserve_upload: base.extend({
    channel: z.enum(CHANNELS),
    name: short,
    bytes: z.number().int().positive(),
    captured_at: z.string().date(),
    source: z.string().max(2000).default(""),
  }),
  finish_upload: base.extend({ asset_id: uuid }),
  preview: base.extend({ asset_id: uuid }),
  verify_evidence: base.extend({
    asset_id: uuid,
    observations: extractionSchema.shape.observations,
    limitations: extractionSchema.shape.limitations,
  }),
  exclude: base
    .extend({
      asset_id: uuid.optional(),
      channel: z.enum(CHANNELS).optional(),
      reason: z.string().trim().min(3).max(1800),
    })
    .refine(
      (p) => Boolean(p.asset_id) !== Boolean(p.channel),
      "Choose a file or channel.",
    ),
  extract: base,
  assess: base,
  save_review: base.extend({
    assessment: assessmentSchema,
    report: reportSchema,
    resolved_flags: z.record(z.string().max(1800), z.string().max(1800)),
    reason: z.string().max(1800),
    evidence_ids: z.array(z.string().max(100)).max(30),
  }),
  share_list: z.object({ audit_id: uuid }),
  share_revoke: z.object({ audit_id: uuid, share_id: uuid }),
  share_create: z.object({
    audit_id: uuid,
    version: z.number().int().positive(),
    request_key: uuid,
    token: shareToken,
    password: sharePassword
      .refine((s) => s === "" || s.length >= 8)
      .default(""),
    expires_at: z.string().datetime({ offset: true }).nullable().default(null),
  }),
  approve: base,
  export: base.extend({ version: z.number().int().positive() }),
  feedback: z.object({
    audit_id: uuid,
    note: z.string().trim().min(1).max(4000),
  }),
  budget: z.object({ audit_id: uuid, budget: z.number().min(0).max(25) }),
  cancel: z.object({ audit_id: uuid }),
  retry: z.object({ audit_id: uuid }),
  delete: z.object({ audit_id: uuid, confirm: short }),
  recover: z.object({
    audit_id: uuid,
    job_id: uuid,
    response_id: z.string().regex(/^resp_[a-zA-Z0-9]+$/),
    reason: z.string().trim().min(3).max(1800),
  }),
};
