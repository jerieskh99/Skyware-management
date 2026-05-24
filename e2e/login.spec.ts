import { test, expect } from "@playwright/test";

test.describe("Login flow", () => {
  test("shows login page at /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Internal Portal")).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("wrong.user");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("Invalid username or password.")
    ).toBeVisible();
  });

  test("logs in with valid demo credentials and reaches dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin.ceo");
    await page.getByLabel("Password").fill("changeme123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Dashboard")).toBeVisible();
  });

  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});
