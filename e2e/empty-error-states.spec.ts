import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ERROR_UI_TIMEOUT_MS = 10_000;
const SLOW_GET_DELAY_MS = 600;

const failingGetRoute = async (
  page: Page,
  status = 503,
  code = "service_unavailable",
): Promise<void> => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code, message: "test-induced" },
          requestId: "test",
        }),
      });
      return;
    }
    await route.continue();
  });
};

test("inline list-level error renders when the GET fails repeatedly", async ({ page }) => {
  await failingGetRoute(page);
  await page.goto("/");

  // No white-screen — TaskInput is mounted independently of the list.
  await expect(page.getByLabel("New task")).toBeVisible();

  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("Retry click re-attempts the GET and clears the error UI on success", async ({ page }) => {
  await failingGetRoute(page);
  await page.goto("/");
  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });

  // Release the failing route and stub a successful empty GET so Retry has a
  // deterministic recovery target. Asserting on a positive arm (EmptyState or
  // a populated list) prevents a transient pre-fetch flicker — `query.isError`
  // briefly flips to false when refetch starts — from satisfying the test.
  await page.unroute("**/api/tasks");
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("No tasks yet. Start by typing above.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });
  await expect(page.getByText("Couldn't load tasks — check connection.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("EmptyState renders when GET resolves with [] (FR4)", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByText("No tasks yet. Start by typing above.")).toBeVisible();
});

test("LoadingState renders skeleton rows during a slow GET (FR5)", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await new Promise((resolve) => setTimeout(resolve, SLOW_GET_DELAY_MS));
    }
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator('[data-testid="skeleton-row"]')).toHaveCount(3, { timeout: 1_500 });
  await expect(page.locator('[data-testid="skeleton-row"]')).toHaveCount(0, {
    timeout: ERROR_UI_TIMEOUT_MS,
  });
});

test("error state has zero critical/serious axe-core violations (NFR-A1)", async ({ page }) => {
  await failingGetRoute(page);
  await page.goto("/");
  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
});

test("reconnect recovery — online transition clears the error and populates the list", async ({
  page,
  context,
}) => {
  await failingGetRoute(page);
  await page.goto("/");
  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });

  // Release the failing route and stub a successful empty GET so the
  // reconnect-driven refetch has a deterministic recovery target. Asserting
  // on EmptyState (rather than the disappearance of the error copy alone)
  // ensures a hung GET cannot satisfy the test by virtue of `query.isError`
  // flipping to false on refetch start.
  await page.unroute("**/api/tasks");
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.continue();
  });

  // Cycle the browser network state offline → online. TanStack Query's
  // onlineManager listens to the native online/offline events and refetches
  // every active query with refetchOnReconnect: true (locked in useTasks).
  // Note: a bare `dispatchEvent("online")` is a no-op because onlineManager
  // only refetches on a true transition; an offline-then-online cycle is
  // required to exercise the wire.
  await context.setOffline(true);
  await context.setOffline(false);

  await expect(page.getByText("No tasks yet. Start by typing above.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });
  await expect(page.getByText("Couldn't load tasks — check connection.")).toHaveCount(0);
});
