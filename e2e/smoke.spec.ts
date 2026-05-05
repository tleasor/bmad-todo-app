import { expect, test } from "@playwright/test";

test("page renders with title, focused input, and healthy backend", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  const input = page.locator("input").first();
  await expect(input).toBeFocused();
  const health = await request.get("/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body.status).toBe("ok");
});
