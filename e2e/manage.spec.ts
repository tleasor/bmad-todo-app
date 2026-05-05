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
