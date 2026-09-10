import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const policy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co; frame-src 'self' blob: https://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'";
function secure(file) {
  const html = readFileSync(file, "utf8").replace(
    "<head>",
    `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`,
  );
  writeFileSync(file, html);
  return html;
}
const app = secure("dist/index.html");
secure("dist/reports/index.html");
writeFileSync("dist/404.html", app);
for (const route of [
  "login",
  "auth/callback",
  "auth/password",
  "auth/connect",
]) {
  mkdirSync(`dist/${route}`, { recursive: true });
  writeFileSync(`dist/${route}/index.html`, app);
}
writeFileSync("dist/.nojekyll", "");
