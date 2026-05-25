import { describe, it, expect } from "vitest";
import { selectTemplate } from "@/lib/pdf/templates";
import type { TemplateInput } from "@/lib/pdf/templates/types";

/**
 * Build a `TemplateInput` for a credit-note row. Per
 * `israel_compliance_audit.md` §A.6/§J the credit-note row carries positive
 * amounts in the DB (a separate, full Cheshbonit Mas in its own right) and
 * the "credit" semantics are expressed by the type + the disclaimer.
 */
function makeInput(overrides: Partial<TemplateInput["doc"]> = {}): TemplateInput {
  const doc: TemplateInput["doc"] = {
    id: "00000000-0000-0000-0000-0000000000c1",
    type: "credit_note",
    status: "finalized",
    publicNumber: "2026-0042",
    documentNumber: 42,
    documentNumberYear: 2026,
    issueDate: new Date("2026-03-15T00:00:00Z"),
    paymentDate: null,
    descriptionLines: [
      { description: "Reversal of consulting hours", lineTotal: 10_000 },
    ],
    amountBeforeVat: 10_000,
    vatAmount: 1_800,
    vatRateBasisPoints: 1800,
    totalAmount: 11_800,
    currency: "ILS",
    exchangeRate: null,
    allocationNumber: null,
    paymentMethod: null,
    reference: null,
    notes: null,
    language: "he",
    client: {
      companyName: "Test Client LTD",
      israeliTaxId: "TEST-123456789",
      address: "1 Test St, Tel Aviv",
    },
    creditedPublicNumber: "2026-0040",
    ...overrides,
  };
  return {
    doc,
    snapshot: {
      capturedAt: new Date().toISOString(),
      company: {
        legalNameEn: "TEST Skyware IT LTD",
        legalNameHe: "TEST סקייוור איי טי בע\"מ",
        companyNumber: "TEST-000000000",
        vatNumber: "TEST-000000000",
        addressLine1: null,
        addressLine2: null,
        city: null,
        postalCode: null,
        country: "IL",
        email: null,
        phone: null,
        websiteUrl: null,
        receiptFooterEn: null,
        receiptFooterHe: null,
      },
    },
    watermark: true,
  };
}

describe("credit_note template - render contract", () => {
  const render = selectTemplate("credit_note");

  it("renders a clear 'Credit note' disclaimer label per israel_compliance_audit.md §A.6", () => {
    const html = render(makeInput());
    // The HTML must surface the bilingual disclaimer above the line items.
    expect(html).toContain("מסמך זיכוי");
    expect(html).toContain("Credit note");
  });

  it("includes a reference to the credited document number", () => {
    const html = render(makeInput({ creditedPublicNumber: "2026-0040" }));
    expect(html).toContain("2026-0040");
  });

  it('uses the "חשבונית זיכוי" Hebrew title (required header phrase)', () => {
    const html = render(makeInput());
    expect(html).toContain("חשבונית זיכוי");
  });

  it("stamps the bilingual watermark when `watermark: true`", () => {
    const html = render(makeInput());
    expect(html).toContain("DRAFT - NOT FOR PRODUCTION");
    expect(html).toContain("טיוטה - לא להפקה");
    expect(html).toContain("class=\"watermark\"");
  });

  it("omits the watermark when `watermark: false`", () => {
    const input = makeInput();
    input.watermark = false;
    const html = render(input);
    expect(html).not.toContain("class=\"watermark\"");
  });
});
