import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const token = "a".repeat(43),
  endpoint = "http://127.0.0.1:55321/functions/v1/report-reader";
test("opens a fixed report in a sandbox; revoked link cannot reopen", async ({
  page,
}) => {
  let revoked = false;
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: revoked ? 404 : 200,
      json: revoked
        ? { error: "Report unavailable." }
        : {
            html: "<!doctype html><html><head></head><body><h1>Approved synthetic report</h1><p>Revision 1</p></body></html>",
          },
    }),
  );
  const requestUrls: string[] = [];
  page.on("request", (r) => requestUrls.push(r.url()));
  await page.goto("/#" + token);
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Approved synthetic report" }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "");
  expect(requestUrls.every((url) => !url.includes(token))).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  revoked = true;
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Report unavailable");
  await expect(page.locator("iframe")).toHaveCount(0);
});
test("password errors, keyboard submission and mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(endpoint, async (route) => {
    const { password } = route.request().postDataJSON();
    await route.fulfill(
      !password
        ? { status: 401, json: { password_required: true } }
        : password === "test-password"
          ? { json: { html: "<h1>Approved report</h1>" } }
          : { status: 404, json: { error: "Report unavailable." } },
    );
  });
  await page.goto("/#" + token);
  await expect(
    page.getByRole("heading", { name: "Protected report" }),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("incorrect");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("status")).toContainText("Report unavailable");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/screenshots/report-sharing-password.png",
    fullPage: true,
  });
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Approved report" }),
  ).toBeVisible();
});
test("malformed links never call the report endpoint", async ({ page }) => {
  let called = false;
  await page.route(endpoint, (route) => {
    called = true;
    return route.abort();
  });
  await page.goto("/#invalid");
  await expect(page.getByRole("status")).toContainText("Report unavailable");
  expect(called).toBe(false);
});
test("staff create, copy and revoke a report link without storing credentials", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let shares: Record<string, unknown>[] = [];
  let savedToken = "";
  await page.route("http://127.0.0.1:55321/functions/v1/api", async (route) => {
    const { action, payload } = route.request().postDataJSON();
    if (action === "share_list") return route.fulfill({ json: { shares } });
    if (action === "share_create") {
      expect(payload.password).toBe("synthetic-password");
      expect(payload.expires_at).not.toBeNull();
      savedToken = payload.token;
      shares = [
        {
          id: "link-1",
          version: 1,
          created_at: new Date().toISOString(),
          expires_at: payload.expires_at,
          revoked_at: null,
          password_protected: true,
        },
      ];
      return route.fulfill({
        json: { id: "link-1", url: "http://127.0.0.1:5180/#" + savedToken },
      });
    }
    expect(action).toBe("share_revoke");
    shares[0].revoked_at = new Date().toISOString();
    return route.fulfill({ json: { revoked: true } });
  });
  await page.goto("http://127.0.0.1:5181");
  await page.getByRole("button", { name: "Share report" }).click();
  await expect(
    page.getByRole("button", { name: "Create link", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Password (optional)").fill("synthetic-password");
  await page.getByLabel("Expires (optional)").fill("2099-01-01T12:00");
  await page.getByRole("button", { name: "Create link", exact: true }).click();
  await expect(page.getByLabel("Private report link")).toHaveValue(
    /#[A-Za-z0-9_-]{43}$/,
  );
  await page.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "#" + savedToken,
  );
  await page.screenshot({
    path: "output/screenshots/report-sharing-dialog.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Link revoked.");
  await expect(page.getByLabel("Private report link")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    savedToken,
  );
});
test("combined hosted build keeps report routes separate and applies security headers", async ({
  page,
  request,
}) => {
  const res = await request.get("http://127.0.0.1:5182/reports/");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(res.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  const document = await res.text();
  expect(document).toContain("/reports/assets/");
  const scripts = document.match(/src="([^"]+)"/)![1];
  expect((await request.get("http://127.0.0.1:5182" + scripts)).status()).toBe(
    200,
  );
  await page.route("**/functions/v1/report-reader", (route) =>
    route.fulfill({ json: { html: "<h1>Hosted approved report</h1>" } }),
  );
  await page.goto("http://127.0.0.1:5182/reports/#" + token);
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Hosted approved report" }),
  ).toBeVisible();
  const app = await request.get("http://127.0.0.1:5182/login");
  expect(await app.text()).not.toContain("/reports/assets/");
});
