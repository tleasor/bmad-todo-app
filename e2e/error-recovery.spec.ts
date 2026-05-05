import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const POST_DELAY_MS = 800;

const waitForInitialTasksLoad = async (page: Page): Promise<void> => {
  // The GET /api/tasks call settles quickly on the dev server but is racy with
  // the optimistic POST that the test is about to issue. Waiting for the
  // skeleton (LoadingState) to unmount avoids capturing pre-counts before the
  // initial list has populated.
  await expect(page.locator("[data-testid='skeleton-row']")).toHaveCount(0, { timeout: 5000 });
};

test("pending state — SyncIndicator appears after 300 ms then unmounts on success", async ({
  page,
}) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, POST_DELAY_MS));
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  await waitForInitialTasksLoad(page);

  const text = `pending ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");

  const indicator = page.locator('[aria-label="Saving"]');
  await expect(indicator).toBeVisible({ timeout: 1000 });
  await expect(indicator).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();
});

test("retry-exhausted state — RetryAction appears, row stays in place (no rollback), axe-clean", async ({
  page,
}) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "validation_error", message: "test-induced" },
          requestId: "test",
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  await waitForInitialTasksLoad(page);

  const preCount = await page.getByRole("listitem").count();
  const text = `exhausted ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");

  const row = page.getByRole("listitem").filter({ hasText: text });
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator(".task-row__error-message")).toHaveText(
    "Couldn't save — check connection.",
  );
  await expect(page.locator(".task-row--retry-exhausted")).toBeVisible();
  expect(await page.getByRole("listitem").count()).toBe(preCount + 1);

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
});

test("retry click resets to pending then succeeds; row text persists", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "validation_error", message: "first-attempt-fail" },
          requestId: "test",
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  await waitForInitialTasksLoad(page);

  const text = `recovered ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");

  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();

  // Replace the failing interceptor with a passthrough so the retry POST hits
  // the real dev backend and succeeds (Story 1.4 idempotent INSERT OR IGNORE).
  await page.unroute("**/api/tasks");
  await page.route("**/api/tasks", (route) => route.continue());

  const recoveredResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/tasks") &&
      response.request().method() === "POST" &&
      response.ok(),
  );
  await retry.click();
  await recoveredResponse;
  await expect(retry).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".task-row__error-message")).toHaveCount(0);
  await expect(page.locator(".task-row--retry-exhausted")).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();
});

test("reduced-motion suppresses SyncIndicator rotation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, POST_DELAY_MS));
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  await waitForInitialTasksLoad(page);

  const text = `reduced ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");

  const indicator = page.locator('[aria-label="Saving"]');
  await expect(indicator).toBeVisible({ timeout: 1000 });
  const animationName = await indicator.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe("none");
});
