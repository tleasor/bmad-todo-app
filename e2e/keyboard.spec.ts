import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const waitForListSettled = async (page: Page): Promise<void> => {
  await expect(async () => {
    const itemCount = await page.getByRole("listitem").count();
    const emptyVisible = await page.getByText("No tasks yet. Start by typing above.").isVisible();
    expect(itemCount > 0 || emptyVisible).toBe(true);
  }).toPass({ timeout: 5000 });
};

const addTask = async (page: Page, text: string): Promise<void> => {
  const input = page.getByLabel("New task");
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();
};

test.beforeEach(async ({ request }) => {
  await request.delete("/api/tasks");
});

test.describe("arrow navigation — Arrow Up/Down and j/k", () => {
  test("Arrow Down from TaskInput focuses first row", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");

    // newest-first: B is row 0, A is row 1
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("ArrowDown");

    await expect(rowB).toBeFocused();
    const outlineWidth = await rowB.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outlineWidth).toBe("2px");
  });

  test("Arrow Down traverses down the list", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");
    await addTask(page, "task-C");

    // newest-first: C is row 0, B is row 1, A is row 2
    const rowC = page.getByRole("listitem").filter({ hasText: "task-C" });
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(rowC).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(rowB).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(rowA).toBeFocused();
  });

  test("j key traverses down the list", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");
    await addTask(page, "task-C");

    // newest-first: C is row 0, B is row 1, A is row 2
    const rowC = page.getByRole("listitem").filter({ hasText: "task-C" });
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(rowC).toBeFocused();

    await page.keyboard.press("j");
    await expect(rowB).toBeFocused();

    await page.keyboard.press("j");
    await expect(rowA).toBeFocused();
  });

  test("Arrow Down on the last row is a no-op", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "only-task");

    const row = page.getByRole("listitem").filter({ hasText: "only-task" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(row).toBeFocused();
  });

  test("Arrow Up from top row returns focus to TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "only-task");

    const row = page.getByRole("listitem").filter({ hasText: "only-task" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(page.getByLabel("New task")).toBeFocused();
  });

  test("k key from top row returns focus to TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "only-task");

    const row = page.getByRole("listitem").filter({ hasText: "only-task" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("k");
    await expect(page.getByLabel("New task")).toBeFocused();
  });

  test("Arrow Up traverses up the list", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");

    // newest-first: B is row 0, A is row 1
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(rowB).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(rowA).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(rowB).toBeFocused();
  });

  test("focus ring visible on every focused row during arrow navigation", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");
    await addTask(page, "task-C");

    // newest-first: C is row 0, B is row 1, A is row 2
    const rowC = page.getByRole("listitem").filter({ hasText: "task-C" });
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(rowC).toBeFocused();

    const outlineC = await rowC.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outlineC).toBe("2px");

    await page.keyboard.press("ArrowDown");
    await expect(rowB).toBeFocused();

    const outlineB = await rowB.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outlineB).toBe("2px");
  });

  test("state changes do not disrupt focus during navigation", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");

    // newest-first: B is row 0, A is row 1
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(rowB).toBeFocused();

    // Toggle via Space — focus must stay on rowB after state change
    await page.keyboard.press("Space");
    await expect(rowB).toBeFocused();

    // Arrow navigation still works after state change
    await page.keyboard.press("ArrowDown");
    await expect(rowA).toBeFocused();
  });
});

test.describe("tab order within and between rows", () => {
  test("Tab from row container reaches Checkbox", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "tab-to-checkbox");

    const row = page.getByRole("listitem").filter({ hasText: "tab-to-checkbox" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → row container
    await expect(row).toBeFocused();

    await page.keyboard.press("Tab"); // → Checkbox
    await expect(row.getByRole("checkbox")).toBeFocused();
  });

  test("Tab through normal row: Checkbox → DeleteButton → next row container", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B"); // newest-first: B = row 0, A = row 1

    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → rowB container
    await expect(rowB).toBeFocused();

    await page.keyboard.press("Tab"); // → rowB Checkbox
    await expect(rowB.getByRole("checkbox")).toBeFocused();

    await page.keyboard.press("Tab"); // → rowB DeleteButton
    await expect(rowB.getByRole("button", { name: "Delete task" })).toBeFocused();

    await page.keyboard.press("Tab"); // → rowA container
    await expect(rowA).toBeFocused();
  });

  test("Tab through retry-exhausted row: Checkbox → RetryAction → DeleteButton → next row; Shift+Tab reverses", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForListSettled(page);
    // Add a normal task first so it lands below the exhausted row (newest-first ordering)
    await addTask(page, "normal-after-exhausted");

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

    const text = `tab-exhausted-${Date.now()}`;
    await page.getByLabel("New task").fill(text);
    await page.getByLabel("New task").press("Enter");
    const row = page.getByRole("listitem").filter({ hasText: text });
    const normalRow = page.getByRole("listitem").filter({ hasText: "normal-after-exhausted" });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Retry" })).toBeVisible();
    await page.unroute("**/api/tasks");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → exhausted row container (newest = row 0)
    await expect(row).toBeFocused();

    await page.keyboard.press("Tab"); // → Checkbox
    await expect(row.getByRole("checkbox")).toBeFocused();

    await page.keyboard.press("Tab"); // → RetryAction
    await expect(row.getByRole("button", { name: "Retry" })).toBeFocused();

    await page.keyboard.press("Tab"); // → DeleteButton
    await expect(row.getByRole("button", { name: "Delete task" })).toBeFocused();

    // AC3: Tab from exhausted DeleteButton exits to next row's <li>
    await page.keyboard.press("Tab"); // → normal row container
    await expect(normalRow).toBeFocused();

    // AC5: Shift+Tab reverses through exhausted row elements
    await page.keyboard.press("Shift+Tab"); // → exhausted DeleteButton
    await expect(row.getByRole("button", { name: "Delete task" })).toBeFocused();

    await page.keyboard.press("Shift+Tab"); // → RetryAction
    await expect(row.getByRole("button", { name: "Retry" })).toBeFocused();

    await page.keyboard.press("Shift+Tab"); // → Checkbox
    await expect(row.getByRole("checkbox")).toBeFocused();

    await page.keyboard.press("Shift+Tab"); // → exhausted row container
    await expect(row).toBeFocused();
  });

  test("Shift+Tab reverses through row elements", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B"); // newest-first: B = row 0, A = row 1

    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → rowB container
    await expect(rowB).toBeFocused();

    await page.keyboard.press("Tab"); // → rowB Checkbox
    await expect(rowB.getByRole("checkbox")).toBeFocused();

    await page.keyboard.press("Tab"); // → rowB DeleteButton
    await expect(rowB.getByRole("button", { name: "Delete task" })).toBeFocused();

    await page.keyboard.press("Tab"); // → rowA container
    await expect(rowA).toBeFocused();

    await page.keyboard.press("Tab"); // → rowA Checkbox
    await expect(rowA.getByRole("checkbox")).toBeFocused();

    await page.keyboard.press("Tab"); // → rowA DeleteButton
    await expect(rowA.getByRole("button", { name: "Delete task" })).toBeFocused();

    await page.keyboard.press("Shift+Tab"); // → rowA Checkbox
    await expect(rowA.getByRole("checkbox")).toBeFocused();

    await page.keyboard.press("Shift+Tab"); // → rowA container
    await expect(rowA).toBeFocused();

    // AC5: Shift+Tab from first-visible row container exits to previous row's last interactive element
    await page.keyboard.press("Shift+Tab"); // → rowB DeleteButton
    await expect(rowB.getByRole("button", { name: "Delete task" })).toBeFocused();
  });

  test("state changes do not alter tab order", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const text = `tab-state-change-${Date.now()}`;
    await addTask(page, text);

    const row = page.getByRole("listitem").filter({ hasText: text });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → row container
    await expect(row).toBeFocused();

    // Toggle via Space on row container; handleRowKeyDown checks target === currentTarget
    await page.keyboard.press("Space");
    await expect(row).toBeFocused(); // focus must remain on row container after Space
    await expect(row.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    // Wait for toggle mutation to complete so Checkbox is re-enabled in the Tab order
    await expect(row.getByRole("checkbox")).not.toBeDisabled();

    // Tab sequence is preserved after state change
    await page.keyboard.press("Tab"); // → Checkbox
    await expect(row.getByRole("checkbox")).toBeFocused();

    await page.keyboard.press("Tab"); // → DeleteButton
    await expect(row.getByRole("button", { name: "Delete task" })).toBeFocused();
  });
});

test.describe("keyboard delete — Delete and Backspace on focused row", () => {
  test("Tab into row, Delete key removes row, focus lands on next row", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");

    // newest-first order: B is row 0, A is row 1
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(rowB).toBeFocused();

    await page.keyboard.press("Delete");
    await expect(rowB).not.toBeVisible({ timeout: 2000 });
    await expect(rowA).toBeFocused();
  });

  test("Tab into row, Backspace key removes row, focus lands on TaskInput when last row", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "only-task");

    const row = page.getByRole("listitem").filter({ hasText: "only-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Backspace");
    await expect(row).not.toBeVisible({ timeout: 2000 });
    await expect(page.getByLabel("New task")).toBeFocused();
  });

  test("axe-core reports no critical or serious violations after keyboard delete", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "axe-delete-task");

    const row = page.getByRole("listitem").filter({ hasText: "axe-delete-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Delete");
    await expect(row).not.toBeVisible({ timeout: 2000 });

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});

test.describe("keyboard toggle — Space on focused row", () => {
  test("Tab into list, Space toggles, focus stays on row", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const text = `kbd-space-toggle ${Date.now()}`;
    await addTask(page, text);

    const row = page.getByRole("listitem").filter({ hasText: text });
    const checkbox = row.getByRole("checkbox");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");

    // checkpoint 1: focus ring present before toggle
    const outlineBefore = await row.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outlineBefore).toBe("2px");

    await page.keyboard.press("Space");

    await expect(checkbox).toHaveAttribute("aria-checked", "true");

    // checkpoint 2: focus ring present after toggle
    const isFocused = await row.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
    const outlineAfter = await row.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outlineAfter).toBe("2px");
  });

  test("axe-core reports no critical violations after keyboard Space toggle", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const text = `kbd-space-a11y ${Date.now()}`;
    await addTask(page, text);

    const row = page.getByRole("listitem").filter({ hasText: text });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect(row.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");

    const results = await new AxeBuilder({ page }).include(".task-row--completed").analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});
