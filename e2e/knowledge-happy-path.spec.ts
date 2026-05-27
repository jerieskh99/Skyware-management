import { test, expect } from "@playwright/test";

/**
 * Knowledge module happy-path e2e.
 *
 * Drives the full author -> submit -> review -> publish loop using the two
 * seeded admin accounts (`admin.ceo` and `admin.cto`). The same-actor guard
 * for review decisions is exercised by attempting to approve with the
 * author still signed in (must fail) before swapping to the second admin.
 *
 * This test runs against a real dev server with the seeded demo database.
 * Spin it up with:
 *   pnpm db:fresh && pnpm dev
 *   pnpm test:e2e
 *
 * If the environment cannot host a browser (e.g. a sandboxed CI without
 * a Chromium binary), set `SKIP_KNOWLEDGE_E2E=1` and the test will skip.
 */

const SKIP = process.env["SKIP_KNOWLEDGE_E2E"] === "1";

const ADMIN_CEO = { username: "admin.ceo", password: "changeme123" };
const ADMIN_CTO = { username: "admin.cto", password: "changeme123" };

async function loginAs(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

async function logout(page: import("@playwright/test").Page) {
  // Cookie-cleanup keeps things deterministic across user swaps regardless
  // of whether the portal exposes a visible sign-out button.
  const ctx = page.context();
  await ctx.clearCookies();
}

test.describe("Knowledge: happy path (create -> submit -> approve -> publish)", () => {
  test.skip(SKIP, "Skipped via SKIP_KNOWLEDGE_E2E=1");

  test("admin.ceo authors and submits; admin.cto approves and publishes", async ({
    page,
  }) => {
    // ── 1. Author signs in and lands on /knowledge ────────────────────
    await loginAs(page, ADMIN_CEO.username, ADMIN_CEO.password);
    await page.goto("/knowledge");
    await expect(page.getByRole("heading", { name: /Knowledge/i })).toBeVisible();

    // ── 2. Open the "Add internal article" funnel ─────────────────────
    await page.getByRole("link", { name: /Add internal article/i }).click();
    await page.waitForURL(/\/knowledge\/new/);

    // ── 3. Fill kind, title, summary, body ────────────────────────────
    const unique = Date.now().toString(36);
    const title = `E2E happy path ${unique}`;
    const summary = "E2E summary line for the happy-path test.";
    const body =
      "## Context\nA short E2E article body for the happy-path test.\n\n## Steps\n1. Step one.\n2. Step two.";

    await page.getByLabel(/Title/i).first().fill(title);
    await page.getByLabel(/Summary/i).first().fill(summary);
    await page.getByLabel(/Body/i).first().fill(body);

    // ── 4. Submit the new-article form ────────────────────────────────
    await page.getByRole("button", { name: /Save|Create|Submit/i }).first().click();

    // Wait for navigation to the article detail page (slug is server-assigned).
    await page.waitForURL(/\/knowledge\/[a-z0-9-]+$/, { timeout: 10_000 });
    const detailUrl = page.url();
    expect(detailUrl).toMatch(/\/knowledge\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // ── 5. Submit for review ──────────────────────────────────────────
    await page.getByRole("button", { name: /Submit for review/i }).click();
    // Some flows show a confirm-dialog; accept it if present.
    const confirm = page.getByRole("button", { name: /Submit|Confirm|OK/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }
    await expect(page.getByText(/Pending review/i)).toBeVisible({ timeout: 10_000 });

    // ── 6. Same-actor guard: ceo cannot decide on own work ────────────
    // The "Decide" button MUST be hidden or disabled when caller is the
    // author. We assert that the dialog cannot proceed to a successful
    // approval; either the button is not present or clicking it yields no
    // status change. The detail page is the source of truth.
    const decideButton = page.getByRole("button", { name: /Decide/i });
    if (await decideButton.isVisible().catch(() => false)) {
      // Open the dialog, try to approve, expect the API call to be
      // rejected (the dialog stays open with an error or the button is
      // disabled). We tolerate either UI surface; the article status
      // must NOT transition to "Approved" while ceo is the actor.
      await decideButton.click();
      const approveRadio = page.getByRole("radio", { name: /Approve/i });
      if (await approveRadio.isVisible().catch(() => false)) {
        await approveRadio.click();
        await page.getByRole("button", { name: /Submit decision/i }).click();
        // The status badge should remain "Pending review".
        await page.waitForTimeout(500);
      }
    }
    await expect(page.getByText(/Pending review/i)).toBeVisible();

    // ── 7. Swap to admin.cto and approve ──────────────────────────────
    await logout(page);
    await loginAs(page, ADMIN_CTO.username, ADMIN_CTO.password);
    await page.goto(detailUrl);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.getByRole("button", { name: /Decide/i }).click();
    await page.getByRole("radio", { name: /Approve/i }).click();
    await page.getByRole("button", { name: /Submit decision/i }).click();

    // Wait for the status badge to transition to "Approved".
    await expect(page.getByText(/Approved/i)).toBeVisible({ timeout: 10_000 });

    // ── 8. Publish the article ────────────────────────────────────────
    await page.getByRole("button", { name: /^Publish$/i }).click();
    // Optional confirm dialog.
    const publishConfirm = page.getByRole("button", { name: /Publish|Confirm|OK/i }).last();
    if (await publishConfirm.isVisible().catch(() => false)) {
      await publishConfirm.click();
    }
    await expect(page.getByText(/^Published$/i)).toBeVisible({ timeout: 10_000 });

    // ── 9. Assert the article appears in the published list ───────────
    await page.goto("/knowledge?status=published");
    await expect(page.getByRole("link", { name: title })).toBeVisible({
      timeout: 10_000,
    });
  });
});
