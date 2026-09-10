import { createFileRoute } from "@tanstack/react-router";
import { Clients } from "@/views/clients";
export const Route = createFileRoute("/clients/")({ component: Clients });
