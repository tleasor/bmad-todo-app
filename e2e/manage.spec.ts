import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.delete("/api/tasks");
});

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

test.describe("manage tasks — toggle", () => {
  test("clicking the checkbox toggles a task to completed", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const text = `toggle-complete ${Date.now()}`;
    await addTask(page, text);

    const row = page.getByRole("listitem").filter({ hasText: text });
    const checkbox = row.getByRole("checkbox");

    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await checkbox.click();

    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await expect(row.locator(".task-row__text")).toHaveCSS("text-decoration-line", "line-through");
    await expect(row.locator(".task-row__text")).toHaveCSS("color", "rgb(111, 111, 120)");
    await expect(row).toHaveClass(/task-row--completed/);
  });

  test("clicking the checkbox again toggles back to active", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const text = `toggle-back ${Date.now()}`;
    await addTask(page, text);

    const row = page.getByRole("listitem").filter({ hasText: text });
    const checkbox = row.getByRole("checkbox");

    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");

    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await expect(row.locator(".task-row__text")).not.toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
  });

  test("completed task stays at same list position (no re-sort)", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const stamp = Date.now();
    const firstText = `first-task ${stamp}`;
    const secondText = `second-task ${stamp}`;

    await addTask(page, firstText);
    await addTask(page, secondText);

    // newest-first — secondText is index 0, firstText is index 1
    const items = page.getByRole("listitem");
    await expect(items.nth(0)).toContainText(secondText);
    await expect(items.nth(1)).toContainText(firstText);

    // Toggle the first item (secondText, index 0)
    const firstRow = items.nth(0);
    await firstRow.getByRole("checkbox").click();
    await expect(firstRow.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");

    // Position must not change
    await expect(items.nth(0)).toContainText(secondText);
    await expect(items.nth(1)).toContainText(firstText);
  });

  test("Space on a focused row toggles completion without .click()", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const text = `space-toggle ${Date.now()}`;
    await addTask(page, text);

    const row = page.getByRole("listitem").filter({ hasText: text });
    const checkbox = row.getByRole("checkbox");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");

    await page.getByLabel("New task").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");

    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    const isFocused = await row.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test("axe-core reports no violations on the completed row state", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const text = `a11y-toggle ${Date.now()}`;
    await addTask(page, text);

    const row = page.getByRole("listitem").filter({ hasText: text });
    await row.getByRole("checkbox").click();
    await expect(row.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");

    const results = await new AxeBuilder({ page }).include(".task-row--completed").analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});

test.describe("manage tasks — delete", () => {
  test("clicking DeleteButton removes the row", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "task-A");
    await addTask(page, "task-B");

    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(2);

    // newest-first: task-B is index 0
    const firstRow = items.nth(0);
    const deleteBtn = firstRow.getByLabel("Delete task");
    await deleteBtn.click();

    await expect(page.getByRole("listitem")).toHaveCount(1, { timeout: 3000 });
    await expect(page.getByRole("listitem").filter({ hasText: "task-A" })).toBeVisible();
  });

  test("focus lands on the next row when a first row is deleted", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "A");
    await addTask(page, "B");
    await addTask(page, "C");

    // newest-first: C(0), B(1), A(2)
    const items = page.getByRole("listitem");
    const rowC = items.nth(0);
    await rowC.getByLabel("Delete task").click();

    // After deleting C (index 0), B should now be at index 0 and focused
    const rowB = items.nth(0);
    const isFocused = await rowB.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test("focus lands on the previous row when the last row is deleted", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "first");
    await addTask(page, "second");

    // newest-first: second(0), first(1)
    const items = page.getByRole("listitem");
    const lastRow = items.nth(1);
    await lastRow.getByLabel("Delete task").click();

    // After deleting first (index 1), second (now index 0) should be focused
    const rowSecond = items.nth(0);
    const isFocused = await rowSecond.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test("focus lands on TaskInput when the only row is deleted", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "solo-task");

    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(1);
    await items.nth(0).getByLabel("Delete task").click();

    await expect(items).toHaveCount(0, { timeout: 3000 });
    const taskInput = page.getByLabel("New task");
    const isFocused = await taskInput.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test("axe-core reports no critical or serious violations after delete", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, "axe-delete-task");

    const items = page.getByRole("listitem");
    await items.nth(0).getByLabel("Delete task").click();
    await expect(items).toHaveCount(0, { timeout: 3000 });

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});

test.describe("manage tasks — undo snackbar", () => {
  test("delete → snackbar appears → click Undo → task restored at original position", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const stamp = Date.now();
    const taskA = `undo-A-${stamp}`;
    const taskB = `undo-B-${stamp}`;

    // Add A then B; newest-first means B is at index 0, A is at index 1
    await addTask(page, taskA);
    await addTask(page, taskB);

    const items = page.getByRole("listitem");
    await expect(items.nth(0)).toContainText(taskB);
    await expect(items.nth(1)).toContainText(taskA);

    // Delete B (index 0)
    await items.nth(0).getByLabel("Delete task").click();
    await expect(items).toHaveCount(1, { timeout: 3000 });

    // Snackbar appears
    const snackbar = page.locator(".undo-snackbar");
    await expect(snackbar).toBeVisible({ timeout: 3000 });
    await expect(snackbar).toContainText("Task deleted");

    // Click Undo
    await snackbar.getByRole("button", { name: "Undo" }).click();

    // B is restored — wait for 2 items
    await expect(items).toHaveCount(2, { timeout: 5000 });
    await expect(items.nth(0)).toContainText(taskB);
    await expect(items.nth(1)).toContainText(taskA);
  });

  test("delete → 5s window expires → Cmd/Ctrl+Z is a no-op", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const taskText = `undo-expire-${Date.now()}`;
    await addTask(page, taskText);

    const items = page.getByRole("listitem");
    await items.nth(0).getByLabel("Delete task").click();
    await expect(items).toHaveCount(0, { timeout: 3000 });

    // Wait for the 5-second window to expire plus buffer
    await page.waitForTimeout(6000);

    // Snackbar should be gone
    await expect(page.locator(".undo-snackbar")).not.toBeVisible();

    // Ctrl+Z (or Meta+Z on mac) should be a no-op
    const isMac = process.platform === "darwin";
    if (isMac) {
      await page.keyboard.press("Meta+z");
    } else {
      await page.keyboard.press("Control+z");
    }

    // Task should NOT reappear
    await page.waitForTimeout(500);
    await expect(items).toHaveCount(0);
  });

  test("concurrent deletes → snackbar collapses → single Undo restores all", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const stamp = Date.now();
    const taskA = `concurrent-A-${stamp}`;
    const taskB = `concurrent-B-${stamp}`;
    const taskC = `concurrent-C-${stamp}`;

    await addTask(page, taskA);
    await addTask(page, taskB);
    await addTask(page, taskC);

    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(3);

    // Delete B (index 1) and C (index 0) rapidly
    const rowC = items.nth(0);
    const rowB = items.nth(1);
    await rowC.getByLabel("Delete task").click();
    await rowB.getByLabel("Delete task").click();

    await expect(items).toHaveCount(1, { timeout: 3000 });

    // Snackbar shows collapsed count
    const snackbar = page.locator(".undo-snackbar");
    await expect(snackbar).toBeVisible({ timeout: 3000 });
    await expect(snackbar).toContainText("2 tasks deleted");

    // Click Undo — restores both tasks
    await snackbar.getByRole("button", { name: "Undo" }).click();
    await expect(items).toHaveCount(3, { timeout: 5000 });
  });

  test("delete → Cmd/Ctrl+Z within window → task restored", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    const taskText = `undo-keyboard-${Date.now()}`;
    await addTask(page, taskText);

    const items = page.getByRole("listitem");
    await items.nth(0).getByLabel("Delete task").click();
    await expect(items).toHaveCount(0, { timeout: 3000 });

    const snackbar = page.locator(".undo-snackbar");
    await expect(snackbar).toBeVisible({ timeout: 3000 });

    const isMac = process.platform === "darwin";
    if (isMac) {
      await page.keyboard.press("Meta+z");
    } else {
      await page.keyboard.press("Control+z");
    }

    await expect(items).toHaveCount(1, { timeout: 5000 });
    await expect(items.nth(0)).toContainText(taskText);
  });

  test("axe-core reports no critical violations with snackbar visible", async ({ page }) => {
    await page.goto("/");
    await waitForListSettled(page);
    await addTask(page, `axe-snackbar-${Date.now()}`);

    const items = page.getByRole("listitem");
    await items.nth(0).getByLabel("Delete task").click();
    await expect(items).toHaveCount(0, { timeout: 3000 });

    const snackbar = page.locator(".undo-snackbar");
    await expect(snackbar).toBeVisible({ timeout: 3000 });

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});
