import { expect, test } from "@playwright/test";

test("página inicial exibe o título do produto", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pet Shop SaaS" })).toBeVisible();
});
