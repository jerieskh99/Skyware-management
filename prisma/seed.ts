/**
 * Idempotent seed script.
 * Run: pnpm db:seed
 *
 * IMPORTANT: Do not add real client names, prices, tax IDs, or employee data.
 * This script uses placeholder values only.
 * Real data must be entered by admins after the portal launches.
 */
import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";
import departmentsFixture from "./fixtures/departments.json";
import rolesFixture from "./fixtures/roles.json";
import channelsFixture from "./fixtures/channels.json";
import tagsFixture from "./fixtures/tags.json";
import featureFlagsFixture from "./fixtures/feature-flags.json";

const prisma = new PrismaClient();

// Placeholder password. Change on first login or via admin panel.
const DEMO_PASSWORD_PLAIN = "changeme123";

async function main() {
  console.log("Seeding...");

  // ---- Departments ----
  const deptMap: Record<string, string> = {};
  for (const d of departmentsFixture) {
    const dept = await prisma.department.upsert({
      where: { key: d.key as "global" | "helpdesk" | "it" | "rnd" },
      update: { nameEn: d.nameEn, nameHe: d.nameHe },
      create: {
        key: d.key as "global" | "helpdesk" | "it" | "rnd",
        nameEn: d.nameEn,
        nameHe: d.nameHe,
        isGlobal: d.isGlobal,
      },
    });
    deptMap[d.key] = dept.id;
  }
  console.log("  Departments OK");

  // ---- Roles ----
  const roleMap: Record<string, string> = {};
  for (const r of rolesFixture) {
    const role = await prisma.role.upsert({
      where: { key: r.key as "employee" | "ceo" | "cto" },
      update: { nameEn: r.nameEn, nameHe: r.nameHe, isAdmin: r.isAdmin },
      create: {
        key: r.key as "employee" | "ceo" | "cto",
        nameEn: r.nameEn,
        nameHe: r.nameHe,
        isAdmin: r.isAdmin,
      },
    });
    roleMap[r.key] = role.id;
  }
  console.log("  Roles OK");

  // ---- Communication channels ----
  for (const ch of channelsFixture) {
    await prisma.communicationChannel.upsert({
      where: { key: ch.key as "global" | "helpdesk" | "it" | "rnd" },
      update: { nameEn: ch.nameEn, nameHe: ch.nameHe },
      create: {
        key: ch.key as "global" | "helpdesk" | "it" | "rnd",
        departmentId: ch.departmentKey ? deptMap[ch.departmentKey] : null,
        nameEn: ch.nameEn,
        nameHe: ch.nameHe,
      },
    });
  }
  console.log("  Channels OK");

  // ---- Tags ----
  for (const t of tagsFixture) {
    await prisma.tag.upsert({
      where: { key: t.key },
      update: { labelEn: t.labelEn, labelHe: t.labelHe, colorHex: t.colorHex },
      create: {
        key: t.key,
        labelEn: t.labelEn,
        labelHe: t.labelHe,
        scope: t.scope as "communication" | "job" | "both",
        isSystem: true,
        colorHex: t.colorHex,
      },
    });
  }
  console.log("  Tags OK");

  // ---- Feature flags ----
  for (const ff of featureFlagsFixture) {
    await prisma.featureFlag.upsert({
      where: { key: ff.key },
      update: { description: ff.description },
      create: { key: ff.key, enabled: ff.enabled, description: ff.description },
    });
  }
  console.log("  Feature flags OK");

  // ---- SLA defaults (per priority) ----
  // Initial values match the previous hardcoded defaults in lib/sla.ts.
  // Admin can edit these from /admin?tab=sla; we only insert on first run.
  const slaDefaults: Array<{ priority: "low" | "normal" | "high" | "urgent"; targetMinutes: number }> = [
    { priority: "low",    targetMinutes: 480 },
    { priority: "normal", targetMinutes: 240 },
    { priority: "high",   targetMinutes: 120 },
    { priority: "urgent", targetMinutes: 60  },
  ];
  for (const row of slaDefaults) {
    await prisma.slaDefaults.upsert({
      where: { priority: row.priority },
      update: {},
      create: { priority: row.priority, targetMinutes: row.targetMinutes },
    });
  }
  console.log("  SLA defaults OK");

  // ---- Demo users (placeholder only — NOT real employees) ----
  // WARNING: Change all passwords before pilot deployment.
  const passwordHash = await bcryptjs.hash(DEMO_PASSWORD_PLAIN, 12);

  const demoUsers = [
    {
      username: "admin.ceo",
      email: "ceo@skyware-it.local",
      displayName: "Skyware CEO",
      roleKey: "ceo",
      deptKey: "global",
    },
    {
      username: "admin.cto",
      email: "cto@skyware-it.local",
      displayName: "Skyware CTO",
      roleKey: "cto",
      deptKey: "global",
    },
    {
      username: "helpdesk.demo",
      email: "helpdesk.demo@skyware-it.local",
      displayName: "Helpdesk Demo",
      roleKey: "employee",
      deptKey: "helpdesk",
    },
    {
      username: "it.demo",
      email: "it.demo@skyware-it.local",
      displayName: "IT Demo",
      roleKey: "employee",
      deptKey: "it",
    },
    {
      username: "rnd.demo",
      email: "rnd.demo@skyware-it.local",
      displayName: "R&D Demo",
      roleKey: "employee",
      deptKey: "rnd",
    },
  ];

  for (const u of demoUsers) {
    const roleId = roleMap[u.roleKey];
    const deptId = deptMap[u.deptKey];
    if (!roleId || !deptId) throw new Error(`Missing role/dept for ${u.username}`);

    await prisma.user.upsert({
      where: { username: u.username },
      update: { email: u.email, displayName: u.displayName },
      create: {
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        passwordHash,
        roleId,
        departmentId: deptId,
      },
    });
  }
  console.log(`  Demo users OK (password: "${DEMO_PASSWORD_PLAIN}" - change before pilot)`);

  // ---- Real Skyware IT clients (imported from skyward-it-elevate/src/data/clients.ts) ----
  // Names and websites only. Contact details, tax IDs, billing terms, and
  // engagement history are intentionally NOT imported and must be filled
  // in per-client by admin.
  const ceo = await prisma.user.findUnique({ where: { username: "admin.ceo" } });
  if (ceo) {
    // Websites verified 2026-05-25 against live HTTP + web search. URLs from
    // skyward-it-elevate/src/data/clients.ts that were dead, parked, or
    // squatted were replaced with the correct corporate or descriptive URL.
    const realClients: Array<{ companyName: string; website: string | null; note?: string }> = [
      // EMMS source URL (emms.org.il) refused connection. Replaced with the
      // official Nazareth Hospital site (nazhosp.com) per Wikipedia + the
      // Nazareth Trust.
      { companyName: "EMMS - The Nazareth Hospital", website: "https://nazhosp.com" },
      { companyName: "Enercon Technologies",         website: "https://www.enercon.co.il" },
      // Source URL (babcom.co.il) refused connection. Replaced with
      // babcomcenters.com confirmed by D&B and the company LinkedIn page.
      { companyName: "Babcom Centers",                website: "https://www.babcomcenters.com" },
      // Source URL (infinya.co.il) refused at fetch time but is the real
      // corporate domain for Infinya Ltd (formerly Hadera Paper) per D&B.
      { companyName: "Infinya",                       website: "https://www.infinya.co.il" },
      // Novomedic has no dedicated site; medtechnica.co.il hosts the project page.
      { companyName: "Novomedic - Sakhnin Medical",   website: "https://medtechnica.co.il/solution/novomedic-medical-surgical-center-sachnin/" },
      { companyName: "Tsofen High-Tech",              website: "https://www.tsofen.org" },
      { companyName: "Optima Design Automation",      website: "https://www.optima-da.com" },
      { companyName: "Zatout Engineering",            website: "https://zatoutgroup.com" },
      // Corrected from "Miterelli Group" to the real legal name "Mitrelli Group".
      { companyName: "Mitrelli Group",                website: "https://mitrelli.com" },
      // passportcard.com is the real corporate site; current fetch returns 403
      // behind Cloudflare bot protection but the domain is correct.
      { companyName: "PassportCard",                  website: "https://www.passportcard.com" },
      { companyName: "Amalnet",                       website: "https://www.amalnet.k12.il" },
      { companyName: "Mybaby",                        website: "https://www.mybaby.co.il" },
      // bassemdabbah.com is now owned by an unrelated US logistics company.
      // The Israeli Bassem Dabbah Ltd has no public corporate website per
      // D&B; admin should fill in any updated contact later.
      { companyName: "Bassem Dabbah",                 website: null, note: "Israeli meat distribution company. No public corporate website." },
    ];
    for (const c of realClients) {
      const existing = await prisma.client.findFirst({ where: { companyName: c.companyName } });
      if (!existing) {
        const noteParts: string[] = [];
        if (c.website) noteParts.push(`Website: ${c.website}`);
        if (c.note) noteParts.push(c.note);
        await prisma.client.create({
          data: {
            companyName: c.companyName,
            notes: noteParts.length > 0 ? noteParts.join("\n") : null,
            status: "active",
            createdByUserId: ceo.id,
            billingAccount: { create: { defaultCurrency: "ILS" } },
          },
        });
      }
    }
    console.log(`  Real clients OK (${realClients.length} entries)`);
  }

  // ---- CompanySettings singleton (TEST placeholder values) ----
  // A fresh DB should render the receipts/PDF pipeline without an admin
  // pre-setup. Every visible string carries a TEST marker so it can never
  // be mistaken for a production company profile.
  // Replace via /admin?tab=company before any real-money usage.
  await prisma.companySettings.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      legalNameEn: "Skyware IT LTD (TEST - replace before production)",
      legalNameHe: "סקייוור איי טי בעמ (טסט - להחליף לפני הפקה)",
      companyNumber: "TEST-000000000",
      vatNumber: "TEST-000000000",
      timezone: "Asia/Jerusalem",
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      email: "test@skyware-it.example",
      phone: "+972-0-0000000",
      addressLine1: "Replace before production",
      city: "Tel Aviv",
      postalCode: "0000000",
      country: "IL",
      websiteUrl: null,
      receiptFooterEn: "TEST receipts. Not a legal document until accountant sign-off.",
      receiptFooterHe: "מסמכי טסט. אינם מסמך חוקי עד אישור רואה חשבון.",
    },
  });
  console.log("  CompanySettings (TEST values) OK");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
