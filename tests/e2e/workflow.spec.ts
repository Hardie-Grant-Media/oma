import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("review → approval → offline export → new draft", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Audits", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Owned media · September 2026" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Channel scores" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download HTML" }),
  ).toBeEnabled();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const html = Buffer.concat(chunks).toString();
  expect(html.match(/<section /g)).toHaveLength(11);
  expect(html).not.toContain("<script");
  const offline = await page.context().newPage();
  await offline.route("**/*", (route) => route.abort());
  await offline.setContent(html);
  await expect(offline.locator("section")).toHaveCount(11);
  await expect(
    offline.getByRole("heading", { name: "Northline House", exact: true }),
  ).toBeVisible();
  await offline.close();
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await page.getByLabel("Finding", { exact: true }).fill("A revised finding.");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(
    page.getByText("Revision 2", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toBeVisible();
});
test("upload → extraction → evidence verification → assessment", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Spring content review" }).click();
  await page.getByRole("link", { name: "Evidence", exact: false }).click();
  await page
    .getByLabel("Or paste text")
    .fill(
      "A named expert introduces the location guide. The same introduction appears on three dated pages.",
    );
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByText("Pasted text.txt", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Verified", exact: true }).check();
  await page.getByRole("button", { name: "Save verification" }).click();
  await page.getByRole("button", { name: "Lock POV & assess" }).click();
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Channel scores" }),
  ).toBeVisible();
});
test("accessible monochrome workspace", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Audits", exact: true }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  const colours = await page.locator("body *").evaluateAll((els) =>
    els.flatMap((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.backgroundColor, s.borderTopColor];
    }),
  );
  for (const colour of colours) {
    const match = colour.match(/rgba?\((\d+), (\d+), (\d+)/);
    if (match)
      expect(
        match[1] === match[2] && match[2] === match[3],
        colour,
      ).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
