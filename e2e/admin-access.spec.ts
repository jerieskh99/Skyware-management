/**
 * Page-access e2e tests.
 *
 * These tests require a running dev server with the seeded demo database.
 * Run with: pnpm test:e2e
 * Start server first: pnpm db:fresh && pnpm dev
 *
 * Demo credentials (placeholders — change before production):
 *   Admin:    admin.ceo / changeme123
 *   Employee: emp.helpdesk.1 / changeme123  (adjust to actual seeded username)
 */

import { test, expect } from "@playwright/test";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loginAs(page: Parameters<typeof test.use>[0] extends never ? never : import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|login)/);
}

const ADMIN = { username: "admin.ceo", password: "changeme123" };

// Use a seeded employee from prisma/seed.ts. Update if seed changes.
const EMPLOYEE = { username: "emp.helpdesk.1", password: "changeme123" };

// ─── Admin access ───────────────────────────────────────────────────────────

test.describe("Admin: can reach all portal sections", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN.username, ADMIN.password);
  });

  const adminPages = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/clients", label: "Clients" },
    { path: "/billing", label: "Billing" },
    { path: "/statistics", label: "Statistics" },
    { path: "/admin", label: "Admin" },
    { path: "/my-jobs", label: "Jobs" },
    { path: "/communication", label: "Communication" },
  ];

  for (const { path, label } of adminPages) {
    test(`admin reaches ${path}`, async ({ page }) => {
      await page.goto(path);
      // Should NOT be redirected to login or dashboard with an error
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(label).first()).toBeVisible();
    });
  }
});

// ─── Employee access ─────────────────────────────────────────────────────────

test.describe("Employee: redirected from admin-only pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, EMPLOYEE.username, EMPLOYEE.password);
  });

  const blockedPages = ["/clients", "/billing", "/statistics", "/admin"];

  for (const path of blockedPages) {
    test(`employee cannot reach ${path}`, async ({ page }) => {
      await page.goto(path);
      // Should be redirected to /dashboard (not /login, not error page)
      await expect(page).toHaveURL(/\/dashboard/);
    });
  }

  test("employee can reach /my-jobs", async ({ page }) => {
    await page.goto("/my-jobs");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("employee can reach /communication", async ({ page }) => {
    await page.goto("/communication");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("employee can reach /settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// ─── Unauthenticated access ──────────────────────────────────────────────────

test.describe("Unauthenticated: all portal routes redirect to login", () => {
  const protectedPaths = ["/dashboard", "/my-jobs", "/clients", "/billing", "/admin"];

  for (const path of protectedPaths) {
    test(`unauthenticated redirect from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
