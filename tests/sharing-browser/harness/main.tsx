import { createRoot } from "react-dom/client";
import { ReportSharing } from "../../../src/components/report-sharing";
import "../../../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <main>
    <h1>Approved synthetic audit</h1>
    <ReportSharing auditId="33000000-0000-4000-8000-000000000001" version={1} />
  </main>,
);
