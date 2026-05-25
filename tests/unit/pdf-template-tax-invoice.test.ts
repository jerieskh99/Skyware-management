import { describe, it, expect } from "vitest";
import { selectTemplate } from "@/lib/pdf/templates";
import type { TemplateInput } from "@/lib/pdf/templates/types";

const baseSnapshot: TemplateInput["snapshot"] = {
  capturedAt: "2026-03-15T08:00:00.000Z",
  company: {
    legalNameEn: "Skyware IT LTD",
    legalNameHe: "סקייוור איי טי בעמ",
    companyNumber: "5XXXXXXXX",
    vatNumber: "5XXXXXXXX",
    addressLine1: "1 Test St",
    addressLine2: null,
    city: "Tel Aviv",
    postalCode: "6100000",
    country: "IL",
    email: "billing@skyware-it.example",
    phone: "+972-3-0000000",
    websiteUrl: null,
    receiptFooterEn: "English footer text for receipts.",
    receiptFooterHe: "טקסט תחתון בעברית למסמכים.",
  },
};

function makeInput(overrides: Partial<TemplateInput["doc"]> = {}): TemplateInput {
  const doc: TemplateInput["doc"] = {
    id: "00000000-0000-0000-0000-0000000000a1",
    type: "tax_invoice",
    status: "finalized",
    publicNumber: "2026-0001",
    documentNumber: 1,
    documentNumberYear: 2026,
    issueDate: new Date("2026-03-15T00:00:00Z"),
    paymentDate: null,
    descriptionLines: [
      { description: "Consulting hours", quantity: 10, unitPrice: 50_000, lineTotal: 500_000 },
      { description: "On-site visit", lineTotal: 100_000 },
    ],
    amountBeforeVat: 600_000,
    vatAmount: 108_000,
    vatRateBasisPoints: 1800,
    totalAmount: 708_000,
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
    creditedPublicNumber: null,
    ...overrides,
  };
  return { doc, snapshot: baseSnapshot, watermark: false };
}

describe("tax_invoice template render contract", () => {
  const render = selectTemplate("tax_invoice");

  it("emits dir=\"rtl\" when language is he", () => {
    const html = render(makeInput({ language: "he" }));
    expect(html).toMatch(/dir="rtl"/);
  });

  it("emits dir=\"ltr\" when language is en", () => {
    const html = render(makeInput({ language: "en" }));
    expect(html).toMatch(/dir="ltr"/);
  });

  it("includes company legal name + tax IDs from snapshot", () => {
    const html = render(makeInput());
    expect(html).toContain("סקייוור איי טי בעמ");
    expect(html).toContain("5XXXXXXXX");
  });

  it("includes the document type label in Hebrew for the tax_invoice type", () => {
    const html = render(makeInput({ language: "he" }));
    expect(html).toContain("חשבונית מס");
  });

  it("includes the document type label in English when language is en", () => {
    const html = render(makeInput({ language: "en" }));
    expect(html).toMatch(/Tax Invoice/i);
  });

  it("includes the watermark text only when watermark flag is true", () => {
    const input = makeInput();
    const off = render({ ...input, watermark: false });
    const on = render({ ...input, watermark: true });
    expect(off).not.toMatch(/DRAFT - NOT FOR PRODUCTION/);
    expect(on).toContain("DRAFT - NOT FOR PRODUCTION");
    expect(on).toContain("טיוטה - לא להפקה");
  });

  it("renders the totals (subtotal, VAT, total)", () => {
    const html = render(makeInput());
    // Money formatted at two decimals in agorot -> shekels.
    expect(html).toMatch(/6,000\.00/);  // amountBeforeVat
    expect(html).toMatch(/1,080\.00/);  // vatAmount
    expect(html).toMatch(/7,080\.00/);  // totalAmount
  });

  it("includes an exchange rate row when currency is non-ILS", () => {
    const html = render(
      makeInput({ currency: "USD", exchangeRate: "3.65", totalAmount: 30000 }),
    );
    expect(html).toContain("3.65");
  });

  it("omits the exchange rate row when currency is ILS", () => {
    const html = render(makeInput({ currency: "ILS", exchangeRate: null }));
    expect(html).not.toMatch(/exchange/i);
  });

  it("renders the Hebrew footer when language is he", () => {
    const html = render(makeInput({ language: "he" }));
    expect(html).toContain("טקסט תחתון בעברית למסמכים.");
  });

  it("renders the English footer when language is en", () => {
    const html = render(makeInput({ language: "en" }));
    expect(html).toContain("English footer text for receipts.");
  });

  it("renders without crashing when descriptionLines is empty", () => {
    const html = render(makeInput({ descriptionLines: [] }));
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("renders an allocation number when present", () => {
    const html = render(makeInput({ allocationNumber: "ALLOC-12345" }));
    expect(html).toContain("ALLOC-12345");
  });
});
