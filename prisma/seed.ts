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

  // ---- Email templates (Phase 4 Wave 2) ----
  // One row per EmailTemplateKind. Bilingual default subject + body with
  // mustache-like {{variable}} placeholders. The Wave-2 render layer
  // interpolates these. We upsert on `kind` (UNIQUE); `update: {}` so an
  // admin's later edits are NEVER overwritten by a re-seed - the seed only
  // provides the first-run defaults.
  //
  // Supported variables: {{client_name}}, {{payment_public_number}},
  // {{amount}}, {{currency}}, {{due_date}}, {{days_overdue}},
  // {{company_name}}, {{contact_url}}.
  const emailTemplates: Array<{
    kind:
      | "payment_reminder_admin"
      | "payment_reminder_client"
      | "hourly_bank_low_admin"
      | "hourly_bank_low_client"
      | "manual_contact";
    name: string;
    subjectEn: string;
    bodyEn: string;
    subjectHe: string;
    bodyHe: string;
    variableNotes: string;
  }> = [
    {
      kind: "payment_reminder_admin",
      name: "Payment reminder - admin notice",
      subjectEn: "Review needed: payment reminder for {{client_name}} ({{payment_public_number}})",
      bodyEn:
        "A payment reminder is ready to send.\n\n" +
        "Client: {{client_name}}\n" +
        "Payment: {{payment_public_number}}\n" +
        "Amount: {{amount}} {{currency}}\n" +
        "Due date: {{due_date}}\n" +
        "Days overdue: {{days_overdue}}\n\n" +
        "Approve, delay, or cancel from the billing reminders queue before it is sent to the client.",
      subjectHe: "נדרש אישור: תזכורת תשלום עבור {{client_name}} ({{payment_public_number}})",
      bodyHe:
        "תזכורת תשלום מוכנה לשליחה.\n\n" +
        "לקוח: {{client_name}}\n" +
        "תשלום: {{payment_public_number}}\n" +
        "סכום: {{amount}} {{currency}}\n" +
        "תאריך לתשלום: {{due_date}}\n" +
        "ימי איחור: {{days_overdue}}\n\n" +
        "יש לאשר, לדחות או לבטל מתוך תור תזכורות התשלום לפני שהתזכורת נשלחת ללקוח.",
      variableNotes:
        "Sent to admins for review. {{days_overdue}} is the count of days past {{due_date}}.",
    },
    {
      kind: "payment_reminder_client",
      name: "Payment reminder - client email",
      subjectEn: "Payment reminder from {{company_name}} - {{payment_public_number}}",
      bodyEn:
        "Dear {{client_name}},\n\n" +
        "This is a friendly reminder that payment {{payment_public_number}} for {{amount}} {{currency}} " +
        "was due on {{due_date}} and is now {{days_overdue}} day(s) overdue.\n\n" +
        "If you have already arranged payment, please disregard this message. " +
        "Otherwise, you can reach us here: {{contact_url}}\n\n" +
        "Thank you,\n{{company_name}}",
      subjectHe: "תזכורת תשלום מאת {{company_name}} - {{payment_public_number}}",
      bodyHe:
        "{{client_name}} שלום,\n\n" +
        "זוהי תזכורת ידידותית כי התשלום {{payment_public_number}} על סך {{amount}} {{currency}} " +
        "היה לתשלום בתאריך {{due_date}} וכעת הוא באיחור של {{days_overdue}} ימים.\n\n" +
        "אם כבר הסדרתם את התשלום, ניתן להתעלם מהודעה זו. " +
        "אחרת, ניתן ליצור עמנו קשר כאן: {{contact_url}}\n\n" +
        "בתודה,\n{{company_name}}",
      variableNotes:
        "Sent to the client. Keep the tone polite; this is a first reminder.",
    },
    {
      kind: "hourly_bank_low_admin",
      name: "Hourly bank low - admin notice",
      subjectEn: "Hourly bank low for {{client_name}} - {{days_overdue}}% reserved",
      bodyEn:
        "An hourly bank has reached its alert threshold.\n\n" +
        "Client: {{client_name}}\n\n" +
        "The bank is nearly consumed. Consider contacting the client to renew or top up the hours.\n\n" +
        "Open the client billing tab to review usage and projected months remaining.",
      subjectHe: "מאגר שעות נמוך עבור {{client_name}}",
      bodyHe:
        "מאגר שעות הגיע לסף ההתראה.\n\n" +
        "לקוח: {{client_name}}\n\n" +
        "המאגר כמעט נוצל במלואו. כדאי ליצור קשר עם הלקוח לחידוש או הוספת שעות.\n\n" +
        "יש לפתוח את לשונית החיובים של הלקוח כדי לבחון את הצריכה ואת מספר החודשים הצפוי שנותר.",
      variableNotes:
        "Sent to admins when a bank crosses the 90% consumption threshold.",
    },
    {
      kind: "hourly_bank_low_client",
      name: "Hourly bank low - client email",
      subjectEn: "Your hours package is running low - {{company_name}}",
      bodyEn:
        "Dear {{client_name}},\n\n" +
        "Your prepaid hours package with {{company_name}} is running low. " +
        "To avoid any interruption to ongoing work, we recommend renewing or topping up your hours.\n\n" +
        "To arrange this or ask any questions, please reach us here: {{contact_url}}\n\n" +
        "Thank you,\n{{company_name}}",
      subjectHe: "חבילת השעות שלכם מתקרבת לסיום - {{company_name}}",
      bodyHe:
        "{{client_name}} שלום,\n\n" +
        "חבילת השעות מראש שלכם מול {{company_name}} מתקרבת לסיום. " +
        "כדי להימנע מהפרעה בעבודה השוטפת, אנו ממליצים לחדש או להוסיף שעות.\n\n" +
        "לתיאום או לכל שאלה, ניתן ליצור עמנו קשר כאן: {{contact_url}}\n\n" +
        "בתודה,\n{{company_name}}",
      variableNotes:
        "Sent to the client when their hourly bank is low. Encourage renewal.",
    },
    {
      kind: "manual_contact",
      name: "Manual contact - blank shell",
      subjectEn: "A message from {{company_name}}",
      bodyEn:
        "Dear {{client_name}},\n\n" +
        "[Write your message here.]\n\n" +
        "Thank you,\n{{company_name}}",
      subjectHe: "הודעה מאת {{company_name}}",
      bodyHe:
        "{{client_name}} שלום,\n\n" +
        "[יש לכתוב כאן את ההודעה.]\n\n" +
        "בתודה,\n{{company_name}}",
      variableNotes:
        "Starting point for an ad-hoc message. The sender edits the body before sending.",
    },
  ];
  for (const t of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { kind: t.kind },
      // Never overwrite admin edits on re-seed; only fill first-run defaults.
      update: {},
      create: {
        kind: t.kind,
        name: t.name,
        subjectEn: t.subjectEn,
        bodyEn: t.bodyEn,
        subjectHe: t.subjectHe,
        bodyHe: t.bodyHe,
        variableNotes: t.variableNotes,
      },
    });
  }
  console.log(`  Email templates OK (${emailTemplates.length} rows)`);

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

  // ---- Mock client with full billing fixture (DEMO) ----
  // A single rich client for testing + presentations: monthly retainer,
  // an hourly bank pre-loaded past 90% usage (so the Wave-2 90% alert
  // fires on the first cron run), a one-time job charge, and payments in
  // several statuses including an overdue one with a lateness rule (so a
  // reminder is scheduled on the first reminder-cron run). Idempotent:
  // keyed off the client companyName. All values are TEST placeholders.
  const ceoUser = await prisma.user.findUnique({ where: { username: "admin.ceo" } });
  const helpdeskDept = deptMap["helpdesk"];
  if (ceoUser && helpdeskDept) {
    const MOCK_NAME = "Mock Client (DEMO)";
    let mock = await prisma.client.findFirst({ where: { companyName: MOCK_NAME } });
    if (!mock) {
      mock = await prisma.client.create({
        data: {
          companyName: MOCK_NAME,
          contactPerson: "Demo Contact",
          email: "demo.client@skyware-it.example",
          phone: "+972-3-0000099",
          address: "1 Demo Street, Tel Aviv",
          israeliTaxId: "TEST-DEMO-999",
          status: "active",
          notes: "DEMO fixture for testing + presentations. Safe to delete.",
          createdByUserId: ceoUser.id,
          billingAccount: { create: { defaultCurrency: "ILS", notes: "DEMO billing account." } },
        },
      });

      const account = await prisma.billingAccount.findUnique({ where: { clientId: mock.id } });
      if (account) {
        const today = new Date();
        const daysAgo = (n: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() - n);
          return d;
        };
        const daysAhead = (n: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + n);
          return d;
        };

        // Monthly retainer (active).
        await prisma.monthlyBillingItem.create({
          data: {
            billingAccountId: account.id,
            serviceName: "Managed IT retainer (DEMO)",
            priceAmountPlaceholder: 250000, // 2,500.00 ILS in agorot
            currency: "ILS",
            billingCycle: "monthly",
            startDate: daysAgo(120),
            status: "active",
            nextDueDate: daysAhead(10),
          },
        });

        // A job for the client (needed for hourly-usage + OTC FKs).
        const demoJob = await prisma.job.create({
          data: {
            publicNumber: "DEMO-0001",
            clientId: mock.id,
            departmentId: helpdeskDept,
            title: "DEMO support task",
            description: "Demo job backing the hourly-bank usage + one-time charge fixtures.",
            status: "reviewed",
            priority: "normal",
            severity: "moderate",
            slaTargetMinutes: 240,
            assignedEmployeeId: ceoUser.id,
            createdByUserId: ceoUser.id,
            assignedTimestamp: daysAgo(20),
            completedTimestamp: daysAgo(15),
            reviewedTimestamp: daysAgo(14),
            timeSpentMinutes: 300,
          },
        });

        // Hourly bank: 100h purchased, ~91% consumed -> triggers 90% alert.
        const bank = await prisma.hourlyBank.create({
          data: {
            billingAccountId: account.id,
            totalHoursPurchasedMinutes: 6000, // 100h
            pricePerHourPlaceholder: 30000, // 300.00 ILS/h
            totalPaymentPlaceholder: 3000000,
            currency: "ILS",
            purchaseDate: daysAgo(90),
            status: "active",
            alertThresholdPercent: 25,
          },
        });
        // Two usage rows summing 5475 min = 91.25% of 6000.
        await prisma.hourlyBankUsage.create({
          data: {
            hourlyBankId: bank.id,
            jobId: demoJob.id,
            minutesUsed: 3000,
            usedAt: daysAgo(40),
            recordedByUserId: ceoUser.id,
            note: "DEMO usage 1",
          },
        });
        await prisma.hourlyBankUsage.create({
          data: {
            hourlyBankId: bank.id,
            jobId: demoJob.id,
            minutesUsed: 2475,
            usedAt: daysAgo(5),
            recordedByUserId: ceoUser.id,
            note: "DEMO usage 2 (pushes bank past 90%)",
          },
        });

        // One-time job charge linked to the demo job.
        await prisma.oneTimeJobCharge.create({
          data: {
            billingAccountId: account.id,
            jobId: demoJob.id,
            jobNameSnapshot: "DEMO support task",
            priceAmountPlaceholder: 80000, // 800.00 ILS
            currency: "ILS",
            dateCreated: daysAgo(14),
          },
        });

        // Payments in several statuses.
        // 1. Paid (history + receipts content).
        await prisma.payment.create({
          data: {
            clientId: mock.id,
            sourceType: "monthly",
            amountPlaceholder: 250000,
            amountBeforeVat: 211864,
            vatAmount: 38136,
            totalAmount: 250000,
            vatRateBasisPoints: 1800,
            currency: "ILS",
            issuedDate: daysAgo(45),
            dueDate: daysAgo(31),
            paidDate: daysAgo(28),
            status: "paid",
            method: "bank_transfer",
            reference: "DEMO-PAID-001",
            createdByUserId: ceoUser.id,
          },
        });
        // 2. Overdue WITH lateness rule -> reminder cron schedules a reminder.
        await prisma.payment.create({
          data: {
            clientId: mock.id,
            sourceType: "one_time",
            amountPlaceholder: 80000,
            amountBeforeVat: 67797,
            vatAmount: 12203,
            totalAmount: 80000,
            vatRateBasisPoints: 1800,
            currency: "ILS",
            issuedDate: daysAgo(30),
            dueDate: daysAgo(14),
            status: "overdue",
            reference: "DEMO-OVERDUE-001",
            createdByUserId: ceoUser.id,
            latenessAmount: 7,
            latenessUnit: "days",
            latenessNotifyAdminFirst: true,
          },
        });
        // 3. Waiting for payment, due soon.
        await prisma.payment.create({
          data: {
            clientId: mock.id,
            sourceType: "monthly",
            amountPlaceholder: 250000,
            amountBeforeVat: 211864,
            vatAmount: 38136,
            totalAmount: 250000,
            vatRateBasisPoints: 1800,
            currency: "ILS",
            issuedDate: daysAgo(3),
            dueDate: daysAhead(11),
            status: "waiting_for_payment",
            reference: "DEMO-WAITING-001",
            createdByUserId: ceoUser.id,
          },
        });
        // 4. Draft.
        await prisma.payment.create({
          data: {
            clientId: mock.id,
            sourceType: "one_time",
            amountPlaceholder: 120000,
            currency: "ILS",
            issuedDate: today,
            status: "draft",
            reference: "DEMO-DRAFT-001",
            createdByUserId: ceoUser.id,
          },
        });
      }
      console.log("  Mock client (DEMO) + billing fixture OK");
    } else {
      console.log("  Mock client (DEMO) already present, skipped");
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
