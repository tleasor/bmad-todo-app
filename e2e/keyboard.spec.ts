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

test.describe.skip("keyboard-only navigation (Epic 4)", () => {
  test("placeholder — see Story 4.x for the real assertions", () => {
    // Real assertions land in Stories 4.1–4.5 (arrow nav, tab order,
    // Escape/i return-focus, typing-anywhere capture, focus-ring audit).
    // This file completes the architecture's five-spec inventory in
    // NFR-M2 by Epic-1 close.
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
