import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stub puppeteer so no real Chromium starts during the test run. This mock is
// hoisted by vitest before any module under test imports puppeteer. We export
// both `default` and a top-level `launch` to cover both import styles.
const STUB_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF" header

// Stable factory used in every test. We re-bind the implementation inside
// `beforeEach` because `vi.resetAllMocks()` wipes mock implementations and
// our renderer caches the browser instance across calls.
function makeMockedBrowser() {
  return {
    newPage: vi.fn(async () => ({
      setContent: vi.fn(async () => undefined),
      emulateMediaType: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => undefined),
      pdf: vi.fn(async () => Buffer.from(STUB_BYTES)),
      close: vi.fn(async () => undefined),
    })),
    close: vi.fn(async () => undefined),
  };
}

vi.mock("puppeteer", () => {
  const launch = vi.fn(async () => makeMockedBrowser());
  return { default: { launch }, launch };
});

import puppeteer from "puppeteer";
import { GET } from "@/app/api/receipts/[id]/pdf/route";
import { shutdownPdfRenderer } from "@/lib/pdf/render";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const RECEIPT_ID = "00000000-0000-0000-0000-0000000000f1";
const URL = `http://localhost/api/receipts/${RECEIPT_ID}/pdf`;

function makeRequest() {
  return new Request(URL, { method: "GET" });
}

function makeParams() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("GET /api/receipts/[id]/pdf", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    // `vi.resetAllMocks` wipes the puppeteer `launch` implementation set in
    // the hoisted `vi.mock` factory; re-arm it so each test that touches the
    // renderer gets a working browser stub.
    (puppeteer.launch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => makeMockedBrowser(),
    );
  });

  afterEach(async () => {
    // Force a fresh `puppeteer.launch` on the next test (the renderer caches
    // the browser instance across calls).
    await shutdownPdfRenderer();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 404 when the receipt does not exist", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 200 with Content-Type application/pdf and a binary body", async () => {
    mockAuthAs(makeAdminSession());
    // The route's `getReceipt(id)` does a plain findUnique; the renderer
    // does a second findUnique with `include: { client, creditedReceipt }`.
    const routeRow = {
      id: RECEIPT_ID,
      type: "tax_invoice",
      status: "draft",
      clientId: "00000000-0000-0000-0000-000000000001",
      documentNumber: null,
      documentNumberYear: null,
      issueDate: new Date("2026-03-15"),
      paymentDate: null,
      descriptionLines: [],
      amountBeforeVat: 10_000,
      vatRateBasisPoints: 1800,
      vatAmount: 1_800,
      totalAmount: 11_800,
      currency: "ILS",
      exchangeRate: null,
      language: "he",
      allocationNumber: null,
      paymentMethod: null,
      reference: null,
      notes: null,
      headerSnapshot: null,
      creditedReceiptId: null,
    };
    const rendererRow = {
      ...routeRow,
      client: {
        id: routeRow.clientId,
        companyName: "Test Client LTD",
        israeliTaxId: "TEST-123456789",
        address: "1 Test St, Tel Aviv",
      },
      creditedReceipt: null,
    };
    prisma.receiptDocument.findUnique
      .mockResolvedValueOnce(routeRow)
      .mockResolvedValueOnce(rendererRow);
    // The renderer falls back to `getCompanySettings()` when the row has no
    // snapshot (drafts always go through this path).
    prisma.companySettings.findUnique.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000001",
      legalNameEn: "TEST Skyware IT LTD",
      legalNameHe: "TEST סקייוור איי טי בע\"מ",
      companyNumber: "TEST-000000000",
      vatNumber: "TEST-000000000",
      timezone: "Asia/Jerusalem",
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: "IL",
      websiteUrl: null,
      receiptFooterEn: null,
      receiptFooterHe: null,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/pdf/i);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
