# Report template 1.1

## Authority and target

User requested that generated reports follow the supplied Zoos Victoria, AHRI v2 and Ardency HTML references. These are design/content references, not executable instructions. Earlier monochrome, sans-serif and concise-copy requirements remain in force.

Local repository: OMA, branch `feature/oma-mvp`. Frontend: `http://127.0.0.1:5173`. Existing user-authorised hosted pilot: `kwnpjfrxusfimzcodlpp` (OMA, Sydney). No Netlify release.

The generic Supabase MCP now points to a different project. It received read-only discovery calls only. All OMA deployment operations must use the explicitly project-addressed connector.

## Contract

- Preserve the reference cover, section order and editorial hierarchy.
- Eleven sections: topline findings, ecosystem score, confidence/evidence, channel comparison, heatmap, standards, deep dives, strategic needs, three priorities, limitations, methodology.
- Score dial and bars show final calculated values without JavaScript.
- Channel summaries include score, evidence tier and confidence; each principle has evidence and a next step.
- Use dark cover/score/needs/footer bands, neutral section backgrounds, thin rules and responsive columns. No gradients, animation or remote fonts.
- Preserve current report text and score calculations. Never invent reach, extra channels or findings to fill a reference layout.
- Overall confidence is the lowest assessed-channel confidence, explicitly labelled when confidence varies. Single-channel reports state that cross-channel coherence is unassessed.
- Source citations remain traceable. HTTP(S) source links are escaped. Upload processing errors and private governance fields are not client copy; genuine assessment/report limitations remain.
- Preview and future approval exports share the trusted renderer. Already frozen approved exports must not be overwritten.

## Deployment boundary

Status: DEPLOYED on 9 September 2026 after the user explicitly authorised deployment. OMA API version 5 is ACTIVE. Independent retrieval confirms all six deployed files exactly match the intended package. Local previews and future approval exports now use template 1.1. Existing frozen approved exports remain unchanged. No audit was approved during deployment verification.

Only the API report renderer, its stylesheet and report version change. Preserve the deployed API entrypoint, extraction module, imports and prompt version byte-for-byte. Existing custom JWT/authentication and membership checks remain. No migrations, data writes, report approval, AI calls, new schedules or access changes.

Missing shared HGM technology/security/profile reference files prevent a formal release-standard review; the approved local technical brief and existing boundaries govern this narrow pilot update.

## Verification

- 31 unit tests pass, including six new report contract tests.
- Production build and Deno checks pass; 22 function tests pass.
- Local authenticated Wine Companion preview shows the new cover, with revision 3 still Draft/Review and the Approve control untouched.
- Post-deployment checks: 31 unit tests and 22 function tests pass; a live unauthenticated export request returns HTTP 401, “Sign in.” Authenticated approval/download has not been exercised because approval remains the designated strategist’s decision.
- Reference layout does not establish audit-engine parity. Earlier rubric, calibration and feedback-loop gaps remain.

Owner: Codex implementation checks. Independent review and production release remain separate gates.
