import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "../../src/lib/fixtures";
const authorization = "00000000-0000-4000-8000-000000000010";
const state = fixture();
const user = {
  id: state.me.id,
  email: "staff@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.synthetic`;
async function mock(
  page: Page,
  options: {
    unapprovedClient?: boolean;
    denied?: boolean;
    expired?: boolean;
    revokeFails?: boolean;
  } = {},
) {
  let signedIn = false;
  const calls: { path: string; method: string; body: unknown }[] = [];
  await page.route("http://127.0.0.1:55321/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : null;
    calls.push({ path, method: req.method(), body });
    if (path.endsWith("/token")) {
      signedIn = true;
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: "synthetic-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        },
      });
    }
    if (path.endsWith("/snapshot"))
      return route.fulfill({
        status: signedIn && !options.denied ? 200 : 403,
        json:
          signedIn && !options.denied ? state : { message: "Access denied." },
      });
    if (path.endsWith("/user")) return route.fulfill({ json: user });
    if (path.endsWith("/consent"))
      return route.fulfill({
        json: {
          redirect_url: `http://127.0.0.1:5191/oma/login/?result=${body.action}`,
        },
      });
    if (path.includes("/oauth/authorizations/"))
      return route.fulfill({
        status: options.expired ? 400 : 200,
        json: options.expired
          ? { message: "Expired" }
          : {
              authorization_id: authorization,
              user,
              client: {
                id: options.unapprovedClient
                  ? "unknown-client"
                  : "dedicated-oma-client",
                name: "ChatGPT",
                uri: "https://chatgpt.com",
                logo_uri: "",
              },
              redirect_uri:
                "https://chatgpt.com/connector_platform_oauth_redirect",
              scope: "email",
            },
      });
    if (path.endsWith("/user/oauth/grants"))
      return req.method() === "DELETE"
        ? route.fulfill({ status: options.revokeFails ? 500 : 204 })
        : route.fulfill({
            json: [
              {
                client: { id: "dedicated-oma-client", name: "ChatGPT" },
                scopes: ["email"],
                granted_at: "2026-09-10",
              },
            ],
          });
    return route.fulfill({ json: {} });
  });
  return calls;
}
async function signIn(page: Page) {
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("Chrome preserves OAuth request through login, shows consent and allows explicitly", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto(`auth/connect/?authorization_id=${authorization}`);
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Allow connection" }),
  ).toBeVisible();
  expect(calls.filter((c) => c.path.endsWith("/consent"))).toHaveLength(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Allow connection" }).click();
  await expect(page).toHaveURL(/result=approve/);
  expect(calls.find((c) => c.path.endsWith("/consent"))?.body).toEqual({
    action: "approve",
  });
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("oma.oauth.authorization"),
    ),
  ).toBeNull();
});
test("Chrome can deny consent without granting access", async ({ page }) => {
  const calls = await mock(page);
  await page.goto(`auth/connect/?authorization_id=${authorization}`);
  await signIn(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/result=deny/);
  expect(calls.find((c) => c.path.endsWith("/consent"))?.body).toEqual({
    action: "deny",
  });
});
for (const scenario of ["unapprovedClient", "expired", "denied"] as const) {
  test(`Chrome rejects ${scenario} connection`, async ({ page }) => {
    const calls = await mock(page, { [scenario]: true });
    await page.goto(`auth/connect/?authorization_id=${authorization}`);
    await signIn(page);
    if (scenario !== "denied")
      await expect(page.getByRole("alert")).toBeVisible();
    else
      await expect(
        page.getByText("Sign in with your OMA staff account to continue."),
      ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Allow connection" }),
    ).toHaveCount(0);
    expect(calls.filter((c) => c.path.endsWith("/consent"))).toHaveLength(0);
  });
}
test("Chrome disconnects an existing connection and preserves staff access", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto(`auth/connect/?authorization_id=${authorization}`);
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Allow connection" }),
  ).toBeVisible();
  await page.goto("auth/connect/");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Disconnected");
  expect(
    calls.some(
      (c) => c.path.endsWith("/user/oauth/grants") && c.method === "DELETE",
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Back to OMA" }).click();
  await expect(
    page.getByRole("heading", { name: "Audits", exact: true }),
  ).toBeVisible();
});
