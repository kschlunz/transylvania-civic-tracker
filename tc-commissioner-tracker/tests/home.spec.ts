import { test, expect } from "@playwright/test";

test("homepage loads with correct title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Civic Ledger/);
});

test("navigation links are visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Meetings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Commissioners", exact: true })).toBeVisible();
});

test("commissioners page loads", async ({ page }) => {
  await page.goto("/commissioners");
  await expect(page).toHaveURL(/commissioners/);
});

test("meetings page loads", async ({ page }) => {
  await page.goto("/meetings");
  await expect(page).toHaveURL(/meetings/);
});
