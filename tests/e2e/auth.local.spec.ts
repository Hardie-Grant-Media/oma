import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
test.describe("Local magic links", () => {
  test.skip(
    process.env.OMA_LOCAL_AUTH_TESTS !== "true",
    "Requires isolated local Supabase.",
  );
  test.use({ baseURL: "http://127.0.0.1:5175" });
  let admin: ReturnType<typeof localClient>;
  const localClient=(url:string,key:string)=>createClient(url,key,{db:{schema:'api'},auth:{persistSession:false,autoRefreshToken:false}});
  const userIds: string[] = [];
  const clientIds: string[] = [];
  test.beforeAll(() => {
    const keys = JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    if (keys.API_URL !== "http://127.0.0.1:55321")
      throw new Error("Local OMA only.");
    admin = localClient(keys.API_URL, keys.SERVICE_ROLE_KEY);
  });
  test.afterAll(async () => {
    for (const clientId of clientIds) {
      const { data: audits } = await admin
        .from("audits")
        .select("id")
        .eq("client_id", clientId);
      for (const audit of audits ?? []) {
        const { data: evidence } = await admin
          .from("evidence")
          .select("path")
          .eq("audit_id", audit.id);
        if (evidence?.length)
          await admin.storage
            .from("evidence")
            .remove(evidence.map((e) => e.path));
        await admin.from("audits").delete().eq("id", audit.id);
      }
      await admin.from("clients").delete().eq("id", clientId);
    }
    for (const id of userIds) {
      await admin.from("members").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });
  const provision = async (role = "member") => {
    const email = `oma-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) throw error;
    userIds.push(data.user.id);
    const inserted = await admin.from("members").insert({
      id: data.user.id,
      name: "Auth test",
      email,
      role,
      active: true,
    });
    if (inserted.error) throw inserted.error;
    return { id: data.user.id, email };
  };
  const link = async (request: APIRequestContext, email: string) => {
    let id = "";
    await expect
      .poll(async () => {
        const res = await request.get("http://127.0.0.1:55324/api/v1/messages");
        const data = await res.json();
        const message = data.messages.find((m: { To: { Address: string }[] }) =>
          m.To.some((t) => t.Address === email),
        );
        id = message?.ID ?? "";
        return id;
      })
      .not.toBe("");
    const message = await (
      await request.get(`http://127.0.0.1:55324/api/v1/message/${id}`)
    ).json();
    const href = String(message.HTML)
      .match(/href="([^"]+)"/)?.[1]
      ?.replace(/&amp;/g, "&");
    if (!href) throw new Error("No email link.");
    const url = new URL(href);
    url.hostname = "127.0.0.1";
    url.port = "55321";
    return url.href;
  };
  test("valid link, reused link and removed membership", async ({
    page,
    request,
  }) => {
    const user = await provision();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Send link", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("If you have access");
    const href = await link(request, user.email);
    await page.goto(href);
    await expect(
      page.getByRole("heading", { name: "Audits", exact: true }),
    ).toBeVisible();
    await admin.from("members").update({ active: false }).eq("id", user.id);
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("Access denied");
    await page.goto(href);
    await expect(
      page.getByRole("heading", { name: "Link expired." }),
    ).toBeVisible();
  });
  test("expired link", async ({ page, request }) => {
    const user = await provision();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Send link", exact: true }).click();
    const href = await link(request, user.email);
    execFileSync(
      "psql",
      [
        "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
        "-c",
        `update auth.users set recovery_sent_at=now()-interval '16 minutes' where id='${user.id}'::uuid`,
      ],
      { stdio: "ignore" },
    );
    await page.goto(href);
    await expect(
      page.getByRole("heading", { name: "Link expired." }),
    ).toBeVisible();
  });
  test("real API: create audit, upload, queue and cancel", async ({
    page,
    request,
  }) => {
    const user = await provision("admin");
    const created = await admin
      .from("clients")
      .insert({ name: "API fixture" })
      .select("id")
      .single();
    if (created.error) throw created.error;
    clientIds.push(created.data.id);
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Send link", exact: true }).click();
    await page.goto(await link(request, user.email));
    await expect(
      page.getByRole("heading", { name: "Audits", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New audit" }).click();
    await page.getByRole("combobox", { name: "Client", exact: true }).click();
    await page
      .getByRole("option", { name: "API fixture", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("API audit");
    await page
      .getByRole("combobox", { name: "Strategist", exact: true })
      .click();
    await page.getByRole("option", { name: "Auth test", exact: true }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "API audit", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Audience", { exact: true }).fill("Readers");
    await page.getByLabel("Category", { exact: true }).fill("Test");
    await page
      .getByLabel("Rationale", { exact: true })
      .fill("A tentative synthetic prediction.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("link", { name: "Evidence", exact: false }).click();
    await page
      .getByLabel("Or paste text")
      .fill("A named local expert introduces three recurring guide formats.");
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Extract", exact: true }).click();
    await expect(page.getByText("Processing", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  });
  test("unregistered email stays generic and cannot create a user", async ({
    page,
  }) => {
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`unknown-${crypto.randomUUID()}@example.test`);
    await page.getByRole("button", { name: "Send link", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("If you have access");
    await expect(
      page.getByRole("button", { name: /Resend in/ }),
    ).toBeDisabled();
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("Sign in");
  });
});
