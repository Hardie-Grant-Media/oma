import { createFileRoute } from "@tanstack/react-router";
import { AuditList } from "@/views/audit-list";
export const Route = createFileRoute("/")({ component: AuditList });
