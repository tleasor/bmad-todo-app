import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SLOW_NETWORK_DELAY_MS = 800;
const OPTIMISTIC_WINDOW_MS = 100;

test("capture happy path renders the task and clears + refocuses the input", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();

  const preCount = await page.getByRole("listitem").count();
  const text = `buy milk ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");

  const newRow = page.getByRole("listitem").filter({ hasText: text });
  await expect(newRow).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.locator('[aria-label="Saving"]')).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await page.getByRole("listitem").count()).toBe(preCount + 1);
});

test("optimistic window: row appears before the network resolves", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, SLOW_NETWORK_DELAY_MS));
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();

  const text = `slow net task ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");

  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible({
    timeout: OPTIMISTIC_WINDOW_MS,
  });
});

test("two captures land newest-first in the list", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();

  const stamp = Date.now();
  const firstText = `first ${stamp}`;
  const secondText = `second ${stamp}`;

  await input.fill(firstText);
  await input.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: firstText })).toBeVisible();

  await input.fill(secondText);
  await input.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: secondText })).toBeVisible();

  const items = page.getByRole("listitem");
  await expect(items.nth(0)).toContainText(secondText);
  await expect(items.nth(1)).toContainText(firstText);
});

test("captured task persists across a page reload", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();

  const text = `persist-check ${Date.now()}`;
  const postSettled = page.waitForResponse(
    (response) =>
      response.url().includes("/api/tasks") &&
      response.request().method() === "POST" &&
      response.ok(),
  );
  await input.fill(text);
  await input.press("Enter");
  await postSettled;

  await page.reload();
  await expect(page.getByLabel("New task")).toBeFocused();
  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();
});

test("axe-core reports no critical or serious violations on the populated state", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();

  const text = `a11y check ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
});
