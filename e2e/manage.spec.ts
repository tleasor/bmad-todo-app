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
