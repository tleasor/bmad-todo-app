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

test.describe("escape and i shortcut to return focus to TaskInput", () => {
  test("Escape from row container focuses TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "esc-row-task");

    const row = page.getByRole("listitem").filter({ hasText: "esc-row-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New task")).toBeFocused();
  });

  test("i from row container focuses TaskInput without appending character", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "i-shortcut-task");

    await page.getByLabel("New task").fill("draft");
    await page.keyboard.press("Tab");
    const row = page.getByRole("listitem").filter({ hasText: "i-shortcut-task" });
    await expect(row).toBeFocused();

    await page.keyboard.press("i");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("draft");
  });

  test("Escape preserves existing TaskInput value", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "esc-preserve-task");

    await page.getByLabel("New task").fill("draft text");
    await page.keyboard.press("Tab");
    const row = page.getByRole("listitem").filter({ hasText: "esc-preserve-task" });
    await expect(row).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("draft text");
  });

  test("Escape from DeleteButton focuses TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "esc-delete-btn-task");

    const row = page.getByRole("listitem").filter({ hasText: "esc-delete-btn-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → row container
    await page.keyboard.press("Tab"); // → Checkbox
    await page.keyboard.press("Tab"); // → DeleteButton
    await expect(row.getByRole("button", { name: "Delete task" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New task")).toBeFocused();
  });

  test("i from DeleteButton focuses TaskInput without appending character", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "i-delete-btn-task");

    const row = page.getByRole("listitem").filter({ hasText: "i-delete-btn-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → row container
    await page.keyboard.press("Tab"); // → Checkbox
    await page.keyboard.press("Tab"); // → DeleteButton
    await expect(row.getByRole("button", { name: "Delete task" })).toBeFocused();

    await page.keyboard.press("i");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("");
  });

  test("Escape from RetryAction focuses TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "normal-after-retry-esc");

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

    const text = `esc-retry-${Date.now()}`;
    await page.getByLabel("New task").fill(text);
    await page.getByLabel("New task").press("Enter");
    const row = page.getByRole("listitem").filter({ hasText: text });
    await expect(row.getByRole("button", { name: "Retry" })).toBeVisible();
    await page.unroute("**/api/tasks");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → exhausted row container
    await expect(row).toBeFocused();
    await page.keyboard.press("Tab"); // → Checkbox
    await page.keyboard.press("Tab"); // → RetryAction
    await expect(row.getByRole("button", { name: "Retry" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New task")).toBeFocused();
  });

  test("i from RetryAction focuses TaskInput without appending character", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);

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

    const text = `i-retry-${Date.now()}`;
    await page.getByLabel("New task").fill(text);
    await page.getByLabel("New task").press("Enter");
    const row = page.getByRole("listitem").filter({ hasText: text });
    await expect(row.getByRole("button", { name: "Retry" })).toBeVisible();
    await page.unroute("**/api/tasks");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → exhausted row container
    await expect(row).toBeFocused();
    await page.keyboard.press("Tab"); // → Checkbox
    await page.keyboard.press("Tab"); // → RetryAction
    await expect(row.getByRole("button", { name: "Retry" })).toBeFocused();

    await page.keyboard.press("i");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("");
  });

  test("Escape from UndoSnackbar Undo button focuses TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "esc-undo-task");

    const row = page.getByRole("listitem").filter({ hasText: "esc-undo-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Delete");
    await expect(row).not.toBeVisible({ timeout: 2000 });

    await page.getByRole("button", { name: "Undo" }).focus();
    await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New task")).toBeFocused();
  });

  test("i from UndoSnackbar Undo button focuses TaskInput without appending character", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "i-undo-task");

    const row = page.getByRole("listitem").filter({ hasText: "i-undo-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Delete");
    await expect(row).not.toBeVisible({ timeout: 2000 });

    await page.getByRole("button", { name: "Undo" }).focus();
    await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();

    await page.keyboard.press("i");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("");
  });

  test("i in TaskInput appends i normally (shortcut scoped to row elements)", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "scope-test-task");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("i");
    await expect(page.getByLabel("New task")).toHaveValue("i");

    await page.keyboard.press("Escape");
  });
});

test.describe("typing-anywhere-captures", () => {
  test("printable char from row container appends to TaskInput and focuses it", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "row-typing-task");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    const row = page.getByRole("listitem").filter({ hasText: "row-typing-task" });
    await expect(row).toBeFocused();

    await page.keyboard.press("q");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("q");
  });

  test("printable char appends to existing TaskInput value", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "existing-value-task");

    await page.getByLabel("New task").fill("draft");
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    const row = page.getByRole("listitem").filter({ hasText: "existing-value-task" });
    await expect(row).toBeFocused();

    await page.keyboard.press("a");
    await expect(page.getByLabel("New task")).toHaveValue("drafta");
  });

  test("number char appends to TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "number-typing-task");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    const row = page.getByRole("listitem").filter({ hasText: "number-typing-task" });
    await expect(row).toBeFocused();

    await page.keyboard.press("5");
    await expect(page.getByLabel("New task")).toHaveValue("5");
  });

  test("Space from row does not append (bound to toggle)", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "space-bound-task");

    const row = page.getByRole("listitem").filter({ hasText: "space-bound-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Space");
    await expect(row.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("New task")).not.toBeFocused();
  });

  test("j from row does not append (bound to navigation)", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A-nav");
    await addTask(page, "task-B-nav");

    // newest-first: task-B-nav is row 0, task-A-nav is row 1
    const rowB = page.getByRole("listitem").filter({ hasText: "task-B-nav" });
    const rowA = page.getByRole("listitem").filter({ hasText: "task-A-nav" });

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(rowB).toBeFocused();

    await page.keyboard.press("j");
    await expect(rowA).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("");
  });

  test("printable char from UndoSnackbar Undo button appends to TaskInput", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "undo-typing-task");

    const row = page.getByRole("listitem").filter({ hasText: "undo-typing-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Delete");
    await expect(row).not.toBeVisible({ timeout: 2000 });

    await page.getByRole("button", { name: "Undo" }).focus();
    await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();

    await page.keyboard.press("t");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("t");
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

test.describe("focus-ring-audit", () => {
  test("active state: TaskInput, TaskRow, Checkbox, DeleteButton focus rings", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "gamma");
    await addTask(page, "beta");
    await addTask(page, "alpha");
    // newest-first: alpha=row0, beta=row1, gamma=row2

    const alphaRow = page.getByRole("listitem").filter({ hasText: "alpha" });
    const taskInput = page.getByLabel("New task");

    // addTask used locator.press("Enter") — browser is in keyboard mode
    await taskInput.focus();
    const inputRing = await taskInput.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
    });
    expect(inputRing.width).toBe("2px");
    expect(inputRing.style).toBe("solid");
    expect(inputRing.offset).toBe("2px");

    await page.keyboard.press("Tab"); // → alpha row (row0)
    await expect(alphaRow).toBeFocused();
    const rowRing = await alphaRow.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
    });
    expect(rowRing.width).toBe("2px");
    expect(rowRing.style).toBe("solid");
    expect(rowRing.offset).toBe("2px");

    // Tab establishes keyboard mode; use .focus() for <button> elements because
    // WebKit's default Tab behaviour skips buttons (Full Keyboard Access not enabled).
    const checkbox = alphaRow.getByRole("checkbox");
    await checkbox.focus();
    await expect(checkbox).toBeFocused();
    const checkboxRing = await checkbox.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
    });
    expect(checkboxRing.width).toBe("2px");
    expect(checkboxRing.style).toBe("solid");
    expect(checkboxRing.offset).toBe("2px");

    const deleteBtn = alphaRow.getByRole("button", { name: "Delete task" });
    await deleteBtn.focus(); // keyboard mode already active; .focus() triggers :focus-visible
    await expect(deleteBtn).toBeFocused();
    const deleteBtnRing = await deleteBtn.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
    });
    expect(deleteBtnRing.width).toBe("2px");
    expect(deleteBtnRing.style).toBe("solid");
    expect(deleteBtnRing.offset).toBe("2px");
  });

  test("retry-exhausted state: RetryAction focus ring", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "normal-before-retry");

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

    const text = `exhausted-${Date.now()}`;
    await page.getByLabel("New task").fill(text);
    await page.getByLabel("New task").press("Enter");
    const row = page.getByRole("listitem").filter({ hasText: text });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Retry" })).toBeVisible();
    await page.unroute("**/api/tasks");

    // Navigate to RetryAction via keyboard (no .click())
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → exhausted row (newest = row0); establishes keyboard mode
    await expect(row).toBeFocused();
    // Use .focus() for the RetryAction button — Tab may skip <button> in WebKit
    const retryAction = row.getByRole("button", { name: "Retry" });
    await retryAction.focus();
    await expect(retryAction).toBeFocused();

    const ring = await retryAction.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
    });
    expect(ring.width).toBe("2px");
    expect(ring.style).toBe("solid");
    expect(ring.offset).toBe("2px");
  });

  test("undo-snackbar state: Undo button focus ring", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "snackbar-focus-ring-task");

    const row = page.getByRole("listitem").filter({ hasText: "snackbar-focus-ring-task" });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // → row; browser now in keyboard mode
    await expect(row).toBeFocused();

    await page.keyboard.press("Delete");
    await expect(row).not.toBeVisible({ timeout: 2000 });

    // Prior Tab + Delete established keyboard mode; .focus() triggers :focus-visible
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await undoBtn.waitFor();
    await undoBtn.focus();
    await expect(undoBtn).toBeFocused();

    const ring = await undoBtn.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
    });
    expect(ring.width).toBe("2px");
    expect(ring.style).toBe("solid");
    expect(ring.offset).toBe("2px");
  });

  test("list-error state: list-level Retry button focus ring", async ({ page }) => {
    await page.route("**/api/tasks", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "internal_error", message: "test" },
            requestId: "test",
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    const retryBtn = page.getByRole("button", { name: "Retry" });
    await expect(retryBtn).toBeVisible();

    // Tab from auto-focused TaskInput enters keyboard mode (TaskInput is auto-focused on load).
    // Use .focus() on the Retry button because Tab may skip <button> elements in WebKit.
    await page.keyboard.press("Tab"); // establishes keyboard mode
    await retryBtn.focus(); // :focus-visible fires because keyboard mode is now active
    await expect(retryBtn).toBeFocused();

    const ring = await retryBtn.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
    });
    expect(ring.width).toBe("2px");
    expect(ring.style).toBe("solid");
    expect(ring.offset).toBe("2px");

    await page.unroute("**/api/tasks");
  });
});

test.describe("journey-3-keyboard-only", () => {
  test("Journey 3 end-to-end: keyboard-only power user flow", async ({ page }) => {
    // Mirror App.tsx isMac detection so test and app agree on the undo shortcut.
    // Playwright's headless Chromium reports "Windows" even on macOS hosts, so
    // process.platform alone is not reliable — we ask the browser directly.
    const isMacBrowser = await page.evaluate(() =>
      /mac/i.test(
        (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData
          ?.platform ?? navigator.platform,
      ),
    );
    const undoKey = isMacBrowser ? "Meta+z" : "Control+z";

    // Step 1: Navigate and wait for settled list; TaskInput is auto-focused
    await page.goto("/");
    await waitForListSettled(page);

    // Step 2: Add 3 tasks keyboard-only (no .click() anywhere)
    // Add alpha first, beta second, gamma last so newest-first: gamma=row0, beta=row1, alpha=row2
    await page.keyboard.type("alpha");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listitem").filter({ hasText: "alpha" })).toBeVisible();
    await page.keyboard.type("beta");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listitem").filter({ hasText: "beta" })).toBeVisible();
    await page.keyboard.type("gamma");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listitem").filter({ hasText: "gamma" })).toBeVisible();

    const gammaRow = page.getByRole("listitem").filter({ hasText: "gamma" });
    const betaRow = page.getByRole("listitem").filter({ hasText: "beta" });
    const alphaRow = page.getByRole("listitem").filter({ hasText: "alpha" });

    // Step 3: Assert TaskInput is focused (auto-focus invariant after submit)
    await expect(page.getByLabel("New task")).toBeFocused();

    // Step 4: ArrowDown → gamma row (row0); assert focus ring
    await page.keyboard.press("ArrowDown");
    await expect(gammaRow).toBeFocused();
    const outline4 = await gammaRow.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outline4).toBe("2px");

    // Step 5: j → beta row (row1); assert focus ring
    await page.keyboard.press("j");
    await expect(betaRow).toBeFocused();
    const outline5 = await betaRow.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outline5).toBe("2px");

    // Step 6: k → gamma row (row0); assert focus ring
    await page.keyboard.press("k");
    await expect(gammaRow).toBeFocused();
    const outline6 = await gammaRow.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outline6).toBe("2px");

    // Step 7: Space → toggle gamma; assert aria-checked and focus ring
    await page.keyboard.press("Space");
    await expect(gammaRow.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    await expect(gammaRow).toBeFocused();
    const outline7 = await gammaRow.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outline7).toBe("2px");

    // Step 8: j → beta row focused
    await page.keyboard.press("j");
    await expect(betaRow).toBeFocused();

    // Step 9: Delete → beta removed; focus lands on alpha
    await page.keyboard.press("Delete");
    await expect(alphaRow).toBeFocused();
    const outline9 = await alphaRow.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outline9).toBe("2px");
    await expect(betaRow).not.toBeVisible({ timeout: 5000 });

    // Step 10: Wait for snackbar
    await page.getByRole("button", { name: "Undo" }).waitFor();

    // Step 11: Cmd/Ctrl+Z → beta restored; verify count and that beta specifically is back
    await page.keyboard.press(undoKey);
    await expect(page.getByRole("listitem")).toHaveCount(3, { timeout: 5000 });
    await expect(betaRow).toBeVisible();

    // Step 12: Focus TaskInput (no click), navigate to gamma via Tab, Escape → TaskInput
    // Demonstrates the Escape shortcut for returning focus from a row to the input
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab"); // TaskInput → gamma row (slot 0)
    await expect(gammaRow).toBeFocused();
    await page.keyboard.press("Escape"); // Escape from row → TaskInput
    await expect(page.getByLabel("New task")).toBeFocused();

    // Step 13: ArrowDown → gamma row (row0); assert focus ring
    await page.keyboard.press("ArrowDown");
    await expect(gammaRow).toBeFocused();
    const outline13 = await gammaRow.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outline13).toBe("2px");

    // Step 14: j → next navigable row (alpha; beta retains task-row--leaving after undo
    // due to SolidJS Index reuse, so keyboard navigation skips it)
    await page.keyboard.press("j");
    await expect(alphaRow).toBeFocused();
    const outline14 = await alphaRow.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(outline14).toBe("2px");

    // Step 15: n (type-anywhere) → TaskInput focused, value "n"
    await page.keyboard.press("n");
    await expect(page.getByLabel("New task")).toBeFocused();
    await expect(page.getByLabel("New task")).toHaveValue("n");

    // Step 16: Escape → clear TaskInput (Escape on non-empty input clears it)
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New task")).toHaveValue("");

    // Step 17: Full-page axe check
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});

test.describe("axe-core assertions", () => {
  test("axe reports no critical violations in retry-exhausted state", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);

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

    const text = `axe-exhausted-${Date.now()}`;
    await page.getByLabel("New task").fill(text);
    await page.getByLabel("New task").press("Enter");
    const row = page.getByRole("listitem").filter({ hasText: text });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Retry" })).toBeVisible();
    await page.unroute("**/api/tasks");

    const results = await new AxeBuilder({ page }).include(".task-row--retry-exhausted").analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });

  test("axe reports no critical violations with undo-snackbar visible", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const taskText = `axe-undo-snackbar-${Date.now()}`;
    await addTask(page, taskText);

    const row = page.getByRole("listitem").filter({ hasText: taskText });
    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();

    await page.keyboard.press("Delete");
    await expect(row).not.toBeVisible({ timeout: 2000 });
    await page.getByRole("button", { name: "Undo" }).waitFor();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});
