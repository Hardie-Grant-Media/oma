import { createFileRoute } from "@tanstack/react-router";
import { ClientView } from "@/views/clients";
export const Route = createFileRoute("/clients/$clientId")({
  component: () => <ClientView clientId={Route.useParams().clientId} />,
});
