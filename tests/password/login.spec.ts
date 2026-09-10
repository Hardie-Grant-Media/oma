import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "../../src/lib/fixtures";
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "staff@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.synthetic`;
const session = {
  access_token: token,
  refresh_token: "synthetic-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user,
};
async function mock(
  page: Page,
  options: {
    denied?: boolean;
    invalid?: boolean;
    expired?: boolean;
    updateFails?: boolean;
  } = {},
) {
  const calls: { path: string; body: any; url: string }[] = [];
  let signedIn = false;
  await page.route("http://127.0.0.1:55321/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const body = request.postDataJSON();
    calls.push({ path: url.pathname, body, url: url.href });
    if (url.pathname.endsWith("/token")) {
      if (options.invalid || options.expired)
        return route.fulfill({
          status: 400,
          json: { error: "invalid_grant", msg: "Invalid credentials" },
        });
      signedIn = true;
      return route.fulfill({ json: session });
    }
    if (url.pathname.endsWith("/user"))
      return route.fulfill({
        status: !signedIn
          ? 401
          : options.updateFails && request.method() === "PUT"
            ? 422
            : 200,
        json: !signedIn
          ? { msg: "No session" }
          : options.updateFails && request.method() === "PUT"
            ? { msg: "Weak password" }
            : user,
      });
    if (url.pathname.endsWith("/logout")) {
      signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith("/snapshot"))
      return route.fulfill({
        status: signedIn && !options.denied ? 200 : 403,
        json:
          signedIn && !options.denied
            ? fixture()
            : { message: options.denied ? "Access denied." : "Sign in" },
      });
    return route.fulfill({ json: {} });
  });
  return calls;
}
test("password login uses email and opens assigned workspace", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Audits", exact: true }),
  ).toBeVisible();
  expect(calls.find((c) => c.path.endsWith("/token"))?.body).toMatchObject({
    email: user.email,
    password: "synthetic-password",
  });
  expect(page.url()).not.toContain("password");
});
test("invalid credentials stay generic; signed-in nonmembers stay denied", async ({
  page,
}) => {
  await mock(page, { invalid: true });
  await page.goto("login");
  await page.getByLabel("Email", { exact: true }).fill("unknown@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to sign in");
  await page.unrouteAll();
  await mock(page, { denied: true });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Access denied");
});
test("recovery uses Pages callback, confirms password and saves securely", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("login");
  await page.getByRole("button", { name: "Set or reset password" }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Send link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("If you have access");
  const recovery = calls.find((c) => c.path.endsWith("/recover"));
  expect(new URL(recovery!.url).searchParams.get("redirect_to")).toBe(
    "http://127.0.0.1:5187/oma/auth/callback?next=password",
  );
  await page.goto("auth/callback?next=password&code=synthetic-code");
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await page
    .getByLabel("New password", { exact: true })
    .fill("a-long-test-passphrase");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-passphrase");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toContainText("don't match");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("a-long-test-passphrase");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByRole("heading", { name: "Password saved" }),
  ).toBeVisible();
  expect(calls.filter((c) => c.path.endsWith("/token"))).toHaveLength(1);
  expect(
    calls.find((c) => c.path.endsWith("/user") && c.body?.password)?.body
      .password,
  ).toBe("a-long-test-passphrase");
  expect(calls.some((c) => c.path.endsWith("/logout"))).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "a-long-test-passphrase",
  );
});
test("expired and missing recovery sessions cannot set a password", async ({
  page,
}) => {
  const calls = await mock(page, { expired: true });
  await requestReset(page);
  await page.goto("auth/callback?next=password&code=expired-code");
  await expect(
    page.getByRole("heading", { name: "Link expired." }),
  ).toBeVisible();
  await page.goto("auth/password");
  await expect(page.getByRole("alert")).toContainText("expired");
  expect(calls.some((c) => c.body?.password)).toBe(false);
});
test("email links remain invitation-only; login is accessible on mobile", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("login");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Use an email link instead" }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Send link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("If you have access");
  expect(calls.find((c) => c.path.endsWith("/otp"))?.body.create_user).toBe(
    false,
  );
  expect(calls.some((c) => c.path.endsWith("/signup"))).toBe(false);
});

test("password update failure is recoverable and never reports success", async ({
  page,
}) => {
  await mock(page, { updateFails: true });
  await requestReset(page);
  await page.goto("auth/callback?next=password&code=update-failure-code");
  await page
    .getByLabel("New password", { exact: true })
    .fill("a-long-test-passphrase");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("a-long-test-passphrase");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn't save");
  await expect(
    page.getByRole("button", { name: "Save password" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Password saved" }),
  ).toHaveCount(0);
});

async function requestReset(page: Page) {
  await page.goto("login");
  await page.getByRole("button", { name: "Set or reset password" }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Send link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("If you have access");
}
