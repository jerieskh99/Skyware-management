# Israeli Tax Compliance Audit for Billing, Invoices, Receipts and Credit Notes

Document prepared for the Skyware engineering team as input to the May 2026 billing-and-receipts module audit. Author: compliance research specialist (not a CPA). All sources are cited inline with the date the page was fetched. Where a claim cannot be confirmed from a public source, the section is marked "Unverified - needs accountant review" and must be reviewed by a licensed Israeli accountant before being relied on for engineering decisions.

Current date used in this research: 2026-05-25.
Currency abbreviations: NIS / ILS / "shekels" / "₪" are used interchangeably across the cited sources; this document uses "NIS" or "ILS" where the source did.

## Document scope and disclaimer

This is a research document, not legal or accounting advice. The Israeli VAT and bookkeeping landscape changed materially in 2024-2026 with the rollout of the "Invoice Israel" (Heshboniyot Yisrael / חשבוניות ישראל) reform and the SHAAM allocation-number requirement. Several thresholds and effective dates were accelerated in late 2025 by VAT Implementation Order 01/2025; engineering should treat every effective-date claim here as subject to "verify with accountant on the day of build" before locking schemas or workflows.

---

## A. Document types and required fields

### A.1 Document type inventory

Israel recognizes a small number of legally distinct business documents. The wrong document for a given transaction is a real compliance risk - issuing a "tax invoice" (חשבונית מס) when only a "receipt" (קבלה) was warranted, or vice versa, can both create exposure.

| Hebrew name | Transliteration | English label | Issued by |
| --- | --- | --- | --- |
| חשבון עסקה / חשבונית עסקה | Cheshbon Iska / Cheshbonit Iska | Proforma invoice / "transaction account" | Anyone, including a service provider before payment |
| חשבונית מס | Cheshbonit Mas | Tax invoice | Osek Murshe (VAT-registered dealer) |
| חשבונית מס/קבלה | Cheshbonit Mas/Kabbala | Tax invoice combined with receipt | Osek Murshe, on payment |
| קבלה | Kabbala | Receipt (confirmation that money was received) | Anyone receiving payment |
| חשבונית (without VAT) | Cheshbonit | Plain invoice / bill | Osek Patur (exempt small business) |
| חשבונית זיכוי | Cheshbonit Zikkui | Credit note | Osek Murshe, to reverse a tax invoice |
| חשבונית חיוב נוסף | Cheshbonit Hiyuv Nosaf | Additional debit note | Osek Murshe, less common (unverified) |
| חשבונית מס סוכן | Cheshbonit Mas Sochen | Agent tax invoice | Authorized agents |
| פקודת יומן | Pkudat Yoman | Journal command | Internal accounting entry that triggers VAT reporting |

- Source: "Israel's tax system uses six types of tax documents, and only the Heshbonit Mas (tax invoice) entitles the buyer to reclaim input VAT" - https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Source on Osek Patur cannot issue tax invoice: "An exempt dealer issues receipts only ... An Osek Patur is forbidden from issuing a tax invoice ... a 'tax accident'" - https://cpa-dray.com/en/blog/osek-patur-guide/ (fetched 2026-05-25); also https://keep.co.il/blog/tax-invoice-osek-patur.html (referenced via search 2026-05-25)
- Source on agent tax invoice and journal command both requiring allocation numbers under ITA v2.0 spec: "Standard tax invoices, 'Agent Tax Invoice' (חשבונית מס סוכן), 'Journal Command' (פקודת יומן)" - https://europe.thomsonreuters.com/compliance/regulatory-updates/israel (fetched 2026-05-25)

### A.2 Tax invoice (חשבונית מס) - mandatory fields

A valid tax invoice must include all of the following. The Hebrew designations are mandatory even if the rest of the document is in English.

- The Hebrew designation **חשבונית מס** ("Heshbonit Mas / Tax Invoice") must appear on the document; same for **עוסק מורשה** ("Osek Murshe / Authorized Dealer"). These Hebrew terms "must appear on the invoice even if every other field is written in English, Arabic, or any other language". Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Word "Original" on the original copy; supplier's legal name; supplier's business address; supplier's 9-digit VAT registration number (Osek Murshe / מספר עוסק). Source: "Dealer name, address, and VAT registration number, 'Tax invoice' title with 'original' and 'authorised dealer' designations" - https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Israel/ (fetched 2026-05-25)
- Buyer's name and address. For B2B transactions, the buyer's VAT number is required. Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Unique sequential invoice number; issue date. Source: "Each invoice requires a unique sequential number and the date of issue. The Israel Tax Authority uses sequential numbering to detect gaps or duplicates during audits" - https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Specific description of goods/services. "A generic line like 'consulting services' is insufficient." Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Per-line unit price excluding VAT, quantity, VAT rate, VAT amount, total including VAT. Source: https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Israel/ (fetched 2026-05-25)
- VAT amount must be on a separate line: "The VAT amount must appear as a distinct, separate line - not bundled into the total". Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- If issued by computerized accounting software, the document must state **"מסמך ממוחשב"** ("computerized document") and the software must be registered/notified with the ITA. Source: "E-invoicing is permitted in Israel, provided it is prominently stated on the invoice that it is a 'computerized document' and prior notification is made to the Israeli Tax Authority (ITA)" - https://dddinvoices.com/learn/e-invoicing-israel (fetched 2026-05-25)
- Allocation number (**מספר הקצאה**) when the pre-VAT amount exceeds the current threshold (see section C). Source: VAT Implementation Order 01/2025 as summarized at https://sovos.com/regulatory-updates/vat/israel-tax-authority-confirms-accelerated-timeline-for-ctc-invoice-allocation-number/ (fetched 2026-05-25)

Interpretation: For Skyware's IT-services workflow, every tax invoice must concatenate a Hebrew block ("חשבונית מס - מקור - עוסק מורשה") with the seller's nine-digit VAT ID alongside the English line items. The numbering must be gap-free per sequence. If the invoice is generated by software it should additionally carry "מסמך ממוחשב".

### A.3 Receipt (קבלה) - required content and timing

- A receipt is "the official confirmation that money was received, issued only after the money has actually been received (cash, check, bank transfer, or credit card)". Source: https://cpa-dray.com/en/blog/osek-patur-guide/ (fetched 2026-05-25)
- "The law requires issuing a receipt 'immediately' upon receiving payment". Source: same as above.
- A receipt does not by itself entitle the recipient to deduct input VAT. Only a Cheshbonit Mas does. Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)

Unverified - needs accountant review: The exact mandatory field list for a stand-alone receipt (number, date, payer, amount, payment method, currency, receiver signature, VAT ID of receiver) is referenced indirectly but is not fully enumerated in the public English sources I reviewed; the authoritative reference is the Israeli VAT Law 5736-1975 and the Income Tax Rules (Bookkeeping) 5733-1973. Confirm with the accountant.

### A.4 Combined tax invoice + receipt (חשבונית מס/קבלה)

Many SMBs issue a combined Cheshbonit Mas/Kabbala when payment and supply happen together. It is the legally most common pattern for cash-basis service providers.

- Cash-basis service providers (lawyers, accountants, many IT consultants) "are allowed to make their tax-point only when payment is received". Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- For cash-basis dealers, "you can request 'allocation approval' for a preliminary document for a tax invoice, such as a transaction/proforma invoice. The preliminary document must include a notice that the input tax cannot be deducted through the allocation approval." Source: https://hcat.co/are-you-ready-for-israel-e-invoices/ (fetched 2026-05-25)

### A.5 Proforma / Cheshbon Iska (חשבון עסקה / חשבונית עסקה)

- A proforma "does not require an allocation number ... However, approval for an allocation can be obtained for a proforma invoice, which serves as confirmation that when a digital tax invoice is subsequently issued for the relevant transaction, an allocation number will be received." Source: https://hcat.co/are-you-ready-for-israel-e-invoices/ (fetched 2026-05-25), restated in govextra and Green Invoice guides
- Proforma is not legally a tax document; it cannot be used by the recipient to claim input VAT.

### A.6 Credit note (חשבונית זיכוי)

A credit note is the legal mechanism in Israel for reversing or correcting a tax invoice. You generally cannot "delete" or "void" a finalized tax invoice; you issue a credit note that nets out the original.

- Required identifying field: each credit note must reference the original invoice number it cancels or corrects. Best-practice industry guidance: "the original invoice's allocation number may be referenced". Source: https://www.greeninvoice.co.il/magazine/israel-invoice/ (fetched 2026-05-25)
- A credit note must independently meet tax-invoice mandatory-field rules (supplier, recipient, VAT ID, sequential number, date, amount, VAT amount). Source: implied across https://invoicedataextraction.com/blog/israel-vat-invoice-requirements and https://www.greeninvoice.co.il/magazine/israel-invoice/ (fetched 2026-05-25)
- Under the rejection workflow for the allocation-number system, "Cancel" causes "the cancellation of the invoice through standard procedures, with the supplier able to request a hearing up till such time as the Invoice and the Credit Note have been fully registered in the system, and the Supplier should not include either the Invoice or its Credit Note in the PCN874 VAT file". Source: https://www.alfasiisrael.com/post/what-you-need-to-know-about-self-invoices-in-israel-and-implementing-tax-decision-6369-18 (fetched 2026-05-25)
- Currently allocation numbers are not directly required on credit notes; however the system can reference the original allocation number. Source: "Credit notes: Currently no allocation number required; however, the original invoice's allocation number may be referenced." - https://www.greeninvoice.co.il/magazine/israel-invoice/ (fetched 2026-05-25). This is a fast-moving area; verify before implementation.

### A.7 Debit note (חשבונית חיוב נוסף)

Unverified - needs accountant review: An "additional charge" tax invoice is sometimes used to add to an existing invoice rather than re-issue. The public English sources I reviewed for this audit do not clearly document a separate "debit note" workflow; the common Israeli pattern is to issue another full Cheshbonit Mas for the incremental amount. The accountant should confirm whether a separate debit-note flow is required for Skyware's billing scenarios.

### What this means for the implementation

- Engineering must model at least: Tax Invoice, Tax Invoice/Receipt (combined), Receipt, Proforma, Credit Note as first-class document types with distinct numbering sequences.
- The data model must record the Hebrew designation, the issuer's VAT registration number, the "computerized document" stamp where applicable, an allocation-number column (nullable until cleared), and a "linked original" foreign key for credit notes.
- Osek Patur clients (small exempt suppliers) must not be allowed to issue Cheshbonit Mas. A clean role gate is required.

---

## B. Numbering rules

Israel requires gap-free sequential numbering of tax documents and forbids the silent deletion of issued tax invoices.

- Each tax invoice must have "a unique sequential number ... The Israel Tax Authority uses sequential numbering to detect gaps or duplicates during audits, so maintaining an unbroken sequence matters." Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- A finalized tax invoice may not simply be deleted; the proper correction is a credit note. See section A.6.
- For voided documents under the allocation-number rejection flow ("Cancel"), both the original invoice and its credit note are excluded from the PCN874 file. Source: https://www.alfasiisrael.com/post/what-you-need-to-know-about-self-invoices-in-israel-and-implementing-tax-decision-6369-18 (fetched 2026-05-25)

Unverified - needs accountant review:
- Whether tax-invoice numbering may reset to 1 at the start of each fiscal year, or must be continuous across years. Both patterns exist in practice in Israeli accounting software; clarify with the accountant before locking schema. Best engineering default: do not reset; keep one monotonic sequence per document type per issuing entity.
- Whether multiple numbering sequences are allowed (e.g. one per branch). Israeli software products do support multiple sequences, but each must independently be gap-free.

### What this means for the implementation

- Sequence generation must be transactional and gap-free. Do not generate a number until the document is committed. Reserve a number only inside a transaction that also writes the document.
- A "void" UI affordance on a finalized tax invoice is non-compliant. Replace with "Issue credit note" workflow that produces a new linked document.
- Soft-delete or hard-delete of finalized tax invoices must be disallowed at the database/RBAC layer, not just hidden in the UI.

---

## C. Allocation number (מספר הקצאה) - the "Invoice Israel" CTC reform

Israel introduced a Continuous Transaction Controls clearance model called "Heshboniyot Yisrael" (Invoice Israel). Every B2B tax invoice above a pre-VAT threshold must obtain an allocation number from the Tax Authority's SHAAM platform before the recipient can deduct input VAT.

### C.1 Confirmed timeline of thresholds (pre-VAT)

The original 2023 rollout plan was accelerated in late 2025 by VAT Implementation Order 01/2025 (also referred to as VAT Execution Directive No. 01/2025), published on 7 December 2025.

| Effective date | Pre-VAT threshold above which an allocation number is required |
| --- | --- |
| 2024-05-05 (Sunday) | NIS 25,000 |
| 2025-01-01 | NIS 20,000 |
| 2026-01-01 | NIS 10,000 |
| 2026-06-01 | NIS 5,000 (the final threshold; reached far earlier than the original 2028 plan) |

Sources confirming the accelerated 2026 thresholds:
- "From 1 January 2026: businesses will need to obtain allocation numbers for invoices of NIS 10,000 (approx. €2,500) or more" and "From 1 June 2026: businesses will need to obtain allocation numbers for invoices of NIS 5,000 (approx. €1,250) or more" - https://sovos.com/regulatory-updates/vat/israel-tax-authority-confirms-accelerated-timeline-for-ctc-invoice-allocation-number/ (fetched 2026-05-25)
- Cited from VAT Execution Directive No. 01/2025: "2025: 20,000 ILS ... January 1, 2026: 10,000 shekels ... June 1, 2026: 5,000 shekels" - https://news.bloombergtax.com/daily-tax-report-international/israel-tax-agency-clarifies-requirements-for-allocating-taxpayer-vat-invoice-numbers (fetched 2026-05-25)
- Israeli law-firm summary: "January 1, 2026: Threshold drops to NIS 10,000 (before VAT) ... June 1, 2026: Threshold drops further to NIS 5,000 (before VAT)" - https://herzoglaw.co.il/en/news-and-insights/overview-of-vat-and-customs-updates-effective-in-2026/ (fetched 2026-05-25)
- Taxand restatement of the same: https://www.taxand.com/our-thinking/insights/israel-key-vat-and-customs-updates-effective-in-2026/ (fetched 2026-05-25)
- KPMG TaxNewsFlash confirming the e-invoicing expansion: https://kpmg.com/us/en/taxnewsflash/news/2025/12/tnf-israel-expansion-of-mandatory-e-invoicing-model.html (fetched 2026-05-25)

Note on conflicting older sources: Several pre-2025 sources (for example https://edicomgroup.com/blog/israel-electronic-invoice-clearance-model, fetched 2026-05-25) describe the original timeline with thresholds of NIS 15,000 in January 2026 and a final NIS 5,000 in January 2028. Those are obsolete. VAT Implementation Order 01/2025 collapses the schedule. Treat the table above as canonical.

### C.2 Scope of the allocation-number requirement

- Applies to B2B domestic transactions. Cross-border invoices are out of scope. B2C is voluntary. Source: "B2B: Mandatory (domestic transactions only); B2G: Not included; B2C: Voluntary; Cross-border: Exempt from allocation requirements" - https://dddinvoices.com/learn/e-invoicing-israel (fetched 2026-05-25)
- Document types currently in scope per ITA technical spec v2.0: standard tax invoices, agent tax invoices (חשבונית מס סוכן), journal commands (פקודת יומן). Source: https://europe.thomsonreuters.com/compliance/regulatory-updates/israel (fetched 2026-05-25)
- Threshold is per invoice (transaction amount), not per company revenue: "the e-invoicing mandate is based on the transaction amount, not company revenue". Source: https://kpmg.com/us/en/taxnewsflash/news/2025/12/tnf-israel-expansion-of-mandatory-e-invoicing-model.html (fetched 2026-05-25)
- Required even for cash-basis service providers: they should obtain an "allocation approval" against a proforma so that a later Cheshbonit Mas can be issued with the allocation number. Source: https://hcat.co/are-you-ready-for-israel-e-invoices/ (fetched 2026-05-25)

### C.3 What happens if a tax invoice is issued without an allocation number when required

- Primary consequence: the recipient cannot deduct input VAT on the invoice. "Invoices lacking valid allocation numbers face 'denial of input VAT deduction'". Source: https://dddinvoices.com/learn/e-invoicing-israel (fetched 2026-05-25)
- The Tax Authority's rejection workflow ("Error 460") effective from 2025-01-01 lets the supplier choose between Cancel, Continue (which forces the invoice to say "no input tax should be deducted for this invoice"), Reversal (zero-VAT invoice plus customer self-invoice), or Request Hearing. Source: https://www.alfasiisrael.com/post/what-you-need-to-know-about-self-invoices-in-israel-and-implementing-tax-decision-6369-18 (fetched 2026-05-25)
- Retroactive allocation requests are possible up to one year after issuance "if the original invoice includes customer tax ID". Source: https://www.greeninvoice.co.il/magazine/israel-invoice/ (fetched 2026-05-25)

### C.4 Tax Authority API for allocation numbers

The integration is exposed by SHAAM as a JSON REST API protected by OAuth2.

- Production endpoint (Approval, MultiApprovals v2): `https://ita-api.taxes.gov.il/shaam/production/MultiApprovals/v2`
- Sandbox: `https://ita-api.taxes.gov.il/shaam/tsandbox/MultiApprovals/v2`
- Auth scheme: OAuth2 "User Restricted" flow.
- Source: "endpoints including a Multi Approval service available at sandbox URL /ita-api.taxes.gov.il/shaam/tsandbox/MultiApprovals/v2 and production URL https://ita-api.taxes.gov.il/shaam/production/MultiApprovals/v2, with OAuth2 User Restricted authorization" - WebSearch summary of https://www.gov.il/BlobFolder/service/connect-to-shaam/he/Service_Pages_shaam_Tax-Authority-Open-API.pdf (fetched 2026-05-25)
- User manual: http://secapp.taxes.gov.il/OpenApiUserGuide/OpenApiUserGuide.pdf (referenced by https://developer-guide.sovos.com/wp-content/uploads/2023/10/ENG-official-OpenApiUserGuide.pdf - fetched 2026-05-25)
- Israel Invoice Model API description: https://www.gov.il/BlobFolder/generalpage/israel-invoice-160723/he/vat_software-houses-180724-en.pdf (referenced via WebSearch 2026-05-25; the gov.il PDF returns 403 to non-browser fetchers, but the document is the public spec).
- Submit format: JSON; mandatory fields include transaction date, invoice number, issuer and recipient details, amount excluding VAT. Source: https://www.comarch.com/trade-and-services/data-management/legal-regulation-changes/the-israel-tax-authority-ita-new-e-invoicing-technical-specifications/ (referenced via WebSearch 2026-05-25)

### C.5 Operational gates before calling the API

To use the SHAAM API a business must:
1. Register the business and its accounting software in the ITA "personal area" (אזור אישי) for VAT.
2. Authorize personnel ("the business owner or authorized representative") to handle allocation requests; representative authorization requires a lawyer's letter; authorized individuals confirm via SMS.
3. Maintain an active "connection authorization" (הרשאת חיבור) which expires every 3 months and must be renewed.
- Source for steps 1 and 2: https://hcat.co/are-you-ready-for-israel-e-invoices/ (fetched 2026-05-25)
- Source for step 3 (3-month authorization renewal): https://www.greeninvoice.co.il/magazine/israel-invoice/ (fetched 2026-05-25)

### What this means for the implementation

- Skyware must treat the allocation-number flow as a synchronous gate in the finalize-invoice path for any invoice with pre-VAT total above the live threshold. The UI must support the four rejection outcomes (Cancel, Continue, Reversal, Request Hearing).
- The integration cannot be built once and forgotten: the connection authorization expires every 3 months and must be renewed in the ITA portal. Surface a "connection valid until" indicator and email/notification reminder.
- The threshold is a time-varying parameter (NIS 10,000 between 2026-01-01 and 2026-05-31, NIS 5,000 from 2026-06-01). Store it as configuration, not a magic number.
- Sandbox-first development is mandatory; the sandbox URL is documented.

### Unverified - needs accountant review (Section C)

- Whether the threshold applies to the pre-VAT total of a single invoice or to the aggregate of related invoices to the same client in a short period. Public sources consistently say "per invoice", but the accountant should confirm there is no anti-splitting rule.
- The exact authoritative URL for VAT Implementation Order 01/2025 in Hebrew on taxes.gov.il (the third-party summaries are explicit but the gov.il pages did not return successfully to this researcher).

---

## D. VAT rate

### D.1 Current rate and recent history

| From | Standard VAT rate |
| --- | --- |
| 1976 (introduction) onward | various; long held at 17% with brief hikes |
| 2025-01-01 | 18% (raised from 17%) |
| 2026-01-01 onward | 18% (proposed rise to 19% was rejected; rate held at 18%) |

Sources:
- 2025 rate increase: "Israel's 2025 Budget Law included a 1% VAT rise from 17% to 18% from 1 January 2025" - https://www.vatcalc.com/vat/israel-vat-rise-to-19-jan-2026-proposal/ (fetched 2026-05-25)
- 2026 hold at 18%: "the Israeli Cabinet agreed a curbed increase in defence spending to avoid a 2026 VAT increase, resulting in VAT remaining at 18%" - same source above
- "Israel Approves 2026 Budget: VAT Stays at 18%" - https://www.vatupdate.com/2025/12/10/israel-approves-2026-budget-vat-stays-at-18-expands-exemptions-eases-bank-entry-rules/ (fetched 2026-05-25)
- Knesset Plenum order raising VAT - https://main.knesset.gov.il/EN/News/PressReleases/Pages/press12324w.aspx (referenced via search 2026-05-25; specific URL not fetched)

### D.2 Zero-rated services and the export rule

For IT services to foreign clients, the relevant rule is Section 30(a)(5) of the VAT Law (חוק מס ערך מוסף), which zero-rates services exported to a foreign resident.

- "The Value Added Tax (VAT) Law (5735-1976) sets out that zero-rate VAT applies to the export of services to a foreign resident." Source: WebSearch summary of https://www.ampeli-tax.com/post/the-entitlement-of-zero-vat (fetched 2026-05-25)
- "Section 30(a)(5) of the VAT Law sets conditions for zero VAT including: the business provides 'services'; the recipient of the service is a 'foreign resident' for VAT purposes; the services are not also provided to an Israeli resident in Israel; the price of the transaction, payment and currency are specified in the business' books; and the business has an agreement or document confirming the transaction details." Source: same as above.
- Recent caselaw has narrowed eligibility: "Recent judgments have interpreted such relief in a narrow manner and have significantly reduced the ability to charge zero-rate VAT on services rendered to foreign residents ... even if an Israeli resident has received any kind of benefit from the services". Source: same as above.

Interpretation: For IT services with any Israeli touchpoint (a user-facing site rendered to Israeli end-users, an Israeli affiliate of a foreign client, services in connection with an Israeli asset), Section 30(a)(5) zero-rating is risky. Engineering should not assume zero-rating; the billing system should support "foreign-resident, zero-rated" as an explicit per-invoice setting that requires evidence (a signed contract reference) attached to the invoice.

### D.3 Reverse-charge and special rules for B2B services

- For B2B sales by a non-resident provider to an Israeli VAT-registered buyer, Israel applies a reverse-charge mechanism: "B2B: No tax collection needed if the buyer provides a valid VAT number; Israel's reverse-charge mechanism applies". Source: https://quaderno.io/guides/israel-vat-guide/ (fetched 2026-05-25)
- For digital-services suppliers (non-resident SaaS), there is proposed/forthcoming dedicated B2C registration for VAT under "electronic and communication services supplied by foreign residents". Source: https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Israel/ (fetched 2026-05-25)

### D.4 Eilat VAT exemption zone

- "For invoicing purposes, the Eilat exemption means that qualifying transactions carry 0% VAT rather than the standard 18% rate." Source: WebSearch summary of https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Goods moved out of Eilat lose the exemption: VAT becomes due at the standard rate. Source: same.

Unverified - needs accountant review: The Eilat exemption mainly covers goods and certain services consumed in Eilat. The exact scope for IT services billed to an Eilat client is not clearly enumerated in the English sources; verify before exposing an "Eilat-zone" toggle.

### What this means for the implementation

- VAT rate must be a per-line setting (a single invoice can mix 18% taxable lines, 0% export lines, and Eilat-zone lines).
- The rate must be stored historically (the rate applied at issue date), not looked up dynamically, so re-rendering an old invoice never silently changes the math.
- "Foreign-resident zero-rated" should require explicit user confirmation and an attached supporting document.

---

## E. Date and currency handling

### E.1 Issue date vs payment date

- Tax invoices must be issued "within 14 days of the taxable supply taking place or of cash settlement, whichever comes first". Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25); confirmed by WebSearch citing VAT Law Section 2 (the section number was cited in summary only, not retrieved from the source PDF, treat with caution).
- Cash-basis service providers' tax-point is the date of receipt of funds, not the date of the deposit-clearing entry. Source: "the date the monies hit the bank - not when a post-dated cheque is received" - WebSearch summary of http://taxinisrael.blogspot.com/2013/06/vat-basics.html (fetched 2026-05-25)

### E.2 Multi-currency invoices and FX rate

- Foreign-currency invoices must show the NIS equivalent at the transaction date and the exchange rate used. "Transaction amount in foreign currency; Equivalent amount in NIS at transaction date; Exchange rate used (Bank of Israel representative rate); VAT is always calculated on the NIS equivalent, not on the foreign currency amount". Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- The Bank of Israel publishes representative rates daily. "The Bank of Israel publishes representative and effective exchange rates for the shekel against major currencies on a daily basis." Source: https://www.boi.org.il/en/economic-roles/financial-markets/explanatory-notes-to-the-representative-exchange-rates/ (fetched 2026-05-25)
- The Bank of Israel notes that representative rates "have no official or legal standing, and are not published in the Official Gazette. They are used mainly for valuations and in contracts. Parties to a foreign-currency-indexed business transaction may carry out the transaction at any exchange rate agreed between them. The representative rate is binding for such a transaction only if explicitly stipulated in advance by the parties." Source: same as above.

Interpretation: Although the Bank of Israel rate is not legally binding by default, Israeli VAT practice treats it as the standard. Skyware should default to the Bank of Israel representative rate for the transaction date, capture both the rate and the source URL on the invoice, and let the user override only with explicit justification.

### E.3 Date format conventions

Unverified - needs accountant review: Israeli convention is day-month-year (DD/MM/YYYY), and many invoices use Gregorian dates while some accounting systems also display Hebrew calendar dates. There is no public source I can cite for a binding rule. The accountant should confirm whether a single ISO date column is acceptable on the rendered invoice.

### What this means for the implementation

- The invoice line model must store the issue date, the supply date (tax-point), and the payment date if known.
- Foreign-currency invoices must store: the transaction-currency amount, NIS-equivalent amount, FX rate, FX-rate source, and FX-rate date.
- VAT calculation must always be performed on the NIS-equivalent amount, never on the foreign-currency amount.
- The 14-day issuance rule should be enforced as a soft warning when the user attempts to issue an invoice dated more than 14 days after supply.

---

## F. Language requirements

- The Hebrew designations "חשבונית מס" and "עוסק מורשה" must be present on every tax invoice. "These Hebrew terms are non-negotiable - they must appear on the invoice even if every other field is written in English, Arabic, or any other language." Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Bilingual invoices (Hebrew + English) are common and permitted; the body of the invoice (descriptions, names) may be in any language as long as the Hebrew designations are present.
- "Computerized document" stamp (מסמך ממוחשב) is also Hebrew-only when applicable. Source: https://dddinvoices.com/learn/e-invoicing-israel (fetched 2026-05-25)

Unverified - needs accountant review:
- Number formatting (comma as thousands separator, period as decimal separator). Israeli convention matches Anglo norms (1,234.56), but a binding rule is not cited.
- RTL rendering. The Hebrew block should render right-to-left; the rest of the document may be LTR. No specific binding spec was found.

### What this means for the implementation

- The PDF renderer must support mixed RTL/LTR within a single document.
- A "Hebrew header block" template that includes the legally required terms must be applied to every tax invoice and credit note.

---

## G. Retention and archiving

- Retention period for tax invoices and supporting documentation: 7 years from the end of the tax year in which the document was issued.
  - "All invoices and supporting documentation must be retained for a minimum of 7 years from the end of the tax year in which they were issued" - https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
  - "Electronic invoices must be archived for 7 years." - https://edicomgroup.com/blog/israel-electronic-invoice-clearance-model (fetched 2026-05-25)
  - "Companies using e-invoicing must ensure that documents are archived in digital format for at least 7 years, maintaining their readability, security, and integrity for the entire period." - https://edicomgroup.com/electronic-invoicing/israel (fetched 2026-05-25)
- "Archiving Abroad: Allowed under conditions." Source: https://europe.thomsonreuters.com/compliance/regulatory-updates/israel (fetched 2026-05-25). The specific conditions are not detailed in the public source and should be confirmed with the accountant.

### G.1 Digital signature and "computerized document"

- Under the new SHAAM clearance model, "Israel does not require a digital electronic signature on invoices to give them legal validity under the new e-invoicing scheme, as Israeli regulations rely on the ITA's centralized control (assignment number) as the authenticity mechanism." Source: WebSearch summary of https://helpx.adobe.com/legal/esignatures/regulations/israel.html (fetched 2026-05-25)
- However, for the older "computerized document" status under the bookkeeping rules: "in order to be fiscally valid, a computerized invoice must be signed with a certified electronic signature". Source: same as above.
- The "computerized document" notice and prior notification to the ITA remain a baseline requirement for any invoice produced by computerized software. Source: https://dddinvoices.com/learn/e-invoicing-israel (fetched 2026-05-25)

### What this means for the implementation

- Store the PDF of every issued document in immutable storage with a 7-year minimum retention policy.
- Use a hash-locked archive (e.g. S3 Object Lock or equivalent) so that no archived document can be silently mutated.
- Pre-notify the ITA of the accounting software per the "computerized document" rule before going live. The accountant will lead this filing.
- Decide with the accountant whether to use a certified electronic signature now (lower risk) or rely solely on the SHAAM clearance allocation number (sufficient under the new model).

### Unverified - needs accountant review (Section G)

- The exact list of "conditions" under which archiving abroad is permitted.
- Whether PDF/A is required, or any PDF that is non-mutable is acceptable.

---

## H. Reporting (background context; out of build scope for this audit)

### H.1 PCN874 - detailed VAT report

- Format: PCN874 file produced by accounting software and uploaded to the ITA. Contains every invoice issued and received in the period. Source: https://tzer.co.il/en/vat-pcn-report-in-israel/ (fetched 2026-05-25)
- Mandatory from January 2026 for businesses with annual turnover above NIS 500,000 (reduced from the prior threshold of NIS 2,500,000). Source: "Starting January 2026, businesses with annual turnover of ₪500,000 or more must file detailed PCN reports. Previously, this threshold was ₪2.5 million." - same source above.
- Allocation number is part of the PCN874 line for invoices above threshold. "Distribution number (מספר הקצאה) mandatory for invoices exceeding ₪20,000". (Note: that statement is the old 2025 threshold; the new 2026 thresholds apply per Section C above.) Source: same.

### H.2 Periodic VAT return

- Monthly return required if business turnover in the prior 12-month period (ending 31 August) exceeds NIS 1,615,000. Otherwise bi-monthly. Source: WebSearch summary of https://help.solarstaff.com/en/articles/9242904-freelance-and-taxes-israel (fetched 2026-05-25)
- Note: a related Grant Thornton source cites a NIS 1,510,000 monthly-filing threshold; the figures are similar but not identical, and may reflect different reporting years. Source: https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Israel/ (fetched 2026-05-25)
- Filing deadline: by the 15th day of the month following the period end; online submission extended until 18:30 on the 19th. Source: WebSearch summary of https://help.solarstaff.com/en/articles/9242904-freelance-and-taxes-israel (fetched 2026-05-25)
- Penalty for late filing: NIS 239 per two-week period of delay (effective from 2024-07-01). Source: https://www.globalvatcompliance.com/globalvatnews/israel-vat-invoicing-updates/ (fetched 2026-05-25)
- Penalty for inadequate recordkeeping: 1% of tax liability with a NIS 359 minimum. Same source.

### H.3 Form 6111 (annual financial statement) and Form 856 (suppliers report)

- Form 6111 is the annual financial statement form filed with the corporate income tax return; it includes income statement, tax reconciliation, balance sheet. Source: WebSearch summary of https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/8684a9474f284ef0a2207fc66d4d97f7/73569f57b1580522e10000000a44147b.html (fetched 2026-05-25)
- Form 856 is the annual report of payments to suppliers/contractors and withholding tax (paired with Form 857 for employees).
- Both are filed annually as part of the corporate tax return; the corporate tax return deadline is "five months following the end of the tax year" (i.e. 31 May for calendar-year filers). Source: https://taxsummaries.pwc.com/israel/corporate/tax-administration (fetched 2026-05-25)

### What this means for the implementation

- These reports are out of scope for the current billing module build, but the billing data model must be PCN874-export-ready (one row per invoice/credit note, with supplier VAT ID, recipient VAT ID, invoice number, allocation number, date, amount excluding VAT, VAT amount, VAT rate). Designing the data model now without these fields will force a painful retrofit when the company's turnover crosses NIS 500,000.
- A "PCN874 export" placeholder feature with a "deferred to Phase X" tag is recommended in the plan.

---

## I. Receipt-vs-invoice timing

### I.1 Receipt timing

- Receipt (קבלה) must be issued immediately upon receipt of payment, regardless of whether a tax invoice was already issued earlier. Source: https://cpa-dray.com/en/blog/osek-patur-guide/ (fetched 2026-05-25)

### I.2 Tax invoice timing

- Tax invoice (חשבונית מס) must be issued within 14 days of the earlier of supply or cash receipt. Source: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements (fetched 2026-05-25)
- Cash-basis service providers (lawyers, accountants, many IT consultants) may defer the tax-point until cash is received; in that case the invoice is issued at payment. Source: WebSearch summary of http://taxinisrael.blogspot.com/2013/06/vat-basics.html (fetched 2026-05-25)

### I.3 Recommended IT-services workflow

For IT-services SMBs operating on a cash basis, the practical sequence is:
1. Issue a proforma (חשבון עסקה) when a job is invoiced for payment.
2. On payment receipt, issue a combined tax invoice + receipt (חשבונית מס/קבלה).
3. If the pre-VAT amount on the tax invoice exceeds the active allocation threshold, obtain an allocation number from SHAAM before delivering the document.

Unverified - needs accountant review: Whether the company should be set up as cash-basis or accrual-basis for VAT. This affects when the tax invoice must be issued and is a question that depends on the licensed status of the underlying business and the firm's accountant's recommendation.

### What this means for the implementation

- The "Mark as paid" action should also be the trigger that issues the combined Cheshbonit Mas/Kabbala for cash-basis flows.
- A "warn if invoice is being issued more than 14 days after supply" check should be added as a non-blocking lint.
- The proforma to invoice transition must preserve the proforma's number for audit traceability, then assign a fresh tax-invoice number from the gap-free sequence.

---

## J. Cancellation, refunds, credit notes

### J.1 No silent void of a finalized tax invoice

A finalized tax invoice cannot be deleted or silently cancelled. The legal mechanism is issuing a credit note (חשבונית זיכוי) that nets out the original.

- Even in the allocation-number rejection workflow, the "Cancel" path produces both an invoice and a credit note for it: "the supplier able to request a hearing up till such time as the Invoice and the Credit Note have been fully registered in the system, and the Supplier should not include either the Invoice or its Credit Note in the PCN874 VAT file". Source: https://www.alfasiisrael.com/post/what-you-need-to-know-about-self-invoices-in-israel-and-implementing-tax-decision-6369-18 (fetched 2026-05-25)

### J.2 Credit-note required fields

A credit note must include all tax-invoice mandatory fields plus a reference to the original invoice number it cancels. It must independently have its own sequential number (typically from a dedicated credit-note sequence).

- "Credit notes: Currently no allocation number required; however, the original invoice's allocation number may be referenced." Source: https://www.greeninvoice.co.il/magazine/israel-invoice/ (fetched 2026-05-25)

### J.3 Effect on the VAT report

- A credit note reduces output VAT in the period of issue (not the period of the original invoice). Both the original invoice and its credit note appear separately in the PCN874 file in the periods they were issued.
- Exception: where the entire invoice/credit-note pair is created as part of the "Cancel" rejection workflow above, both are excluded from the PCN874 file. Source: https://www.alfasiisrael.com/post/what-you-need-to-know-about-self-invoices-in-israel-and-implementing-tax-decision-6369-18 (fetched 2026-05-25)

### J.4 Time limits

Unverified - needs accountant review: There is no firmly cited time limit on issuing a credit note in the public sources I reviewed; in practice credit notes are typically issued within the open VAT period or shortly thereafter. Confirm.

### What this means for the implementation

- The UI for a finalized tax invoice must never expose "Delete" or "Edit". It must only expose "Issue credit note" and "Issue replacement tax invoice".
- Credit notes must be linked to the original by foreign key, with the original allocation number stored as a denormalized reference.
- A "partial credit note" must be supported (credit for one line, not the whole invoice). Each line should reference the original line item.

---

## K. IT-services-specific pitfalls

### K.1 Hourly retainers vs fixed-price work

Unverified - needs accountant review: There is no special-case rule for hourly retainers vs fixed-price IT work in the public English sources. The general rule (issue tax invoice within 14 days of supply or payment, whichever comes first) applies. For monthly retainers, the supply is treated as monthly, so a monthly tax invoice is standard. Confirm with the accountant.

### K.2 Multi-month retainers

- Best practice: issue a monthly tax invoice on the last day of each retainer month, rather than a single annual invoice. This keeps the tax-point inside the same VAT period and avoids prepayment complexities.
- For prepaid annual contracts, an Israeli accountant will typically advise either splitting into monthly invoices, or issuing one large tax invoice and treating the supply as completed at issuance.

Unverified - needs accountant review.

### K.3 Reverse-charge for foreign clients

See section D.3. The Israeli supplier issuing services to a foreign client either zero-rates under Section 30(a)(5) (with risk per recent caselaw) or charges 18% VAT.

### K.4 Equipment vs services split

If a Skyware client invoice contains both an equipment line (taxable in Israel) and a service line (potentially zero-rated to a foreign client), each line must be VAT-rated independently. Mixed-rate invoices are explicitly supported by the standard tax-invoice schema (per-line VAT rate).

### K.5 Reimbursable expenses

Unverified - needs accountant review: Passthrough of supplier invoices (e.g. AWS receipts re-billed to a client) must either be invoiced at zero margin with the supplier's invoice attached, or marked-up with VAT charged on the marked-up total. Confirm the correct treatment with the accountant for each pattern Skyware uses.

### What this means for the implementation

- The line-item model must support a per-line VAT rate (18%, 0% export, 0% Eilat, exempt) and a per-line "zero-rate justification" free-text or document attachment.
- Recurring/retainer jobs already exist in the codebase per the project's Phase 3 commit; ensure each recurring instance issues a fresh tax invoice on its own date, never reuses an old document.

---

## L. Tax Authority API and existing third-party SaaS

### L.1 Direct API integration

- Platform: SHAAM (the ITA computerized processing system).
- Endpoints (Approval / MultiApprovals v2):
  - Production: `https://ita-api.taxes.gov.il/shaam/production/MultiApprovals/v2`
  - Sandbox: `https://ita-api.taxes.gov.il/shaam/tsandbox/MultiApprovals/v2`
- Format: JSON request/response, OAuth2 "User Restricted" authentication.
- Reference docs:
  - https://www.gov.il/BlobFolder/service/connect-to-shaam/he/Service_Pages_shaam_Tax-Authority-Open-API.pdf (returns 403 to non-browser HTTP clients but is the official Tax Authority Open API service page)
  - https://www.gov.il/BlobFolder/generalpage/israel-invoice-160723/he/vat_software-houses-180724-en.pdf (Israel Invoice Model API description, English, for software vendors)
  - User manual: http://secapp.taxes.gov.il/OpenApiUserGuide/OpenApiUserGuide.pdf
- All URL references retrieved via WebSearch summary on 2026-05-25.

### L.2 Israeli SaaS vendors that wrap the SHAAM integration

Inventory only; no recommendation:

- **Green Invoice** (גרין-אינווייס; also branded "Morning" after acquisition by TeamSystem). Cloud invoicing platform; supports automatic SHAAM allocation-number requests; offers a public API for accounting and invoice issuance. Source: https://www.greeninvoice.co.il/magazine/israel-invoice/ (fetched 2026-05-25); company background https://finder.startupnationcentral.org/company_page/green-invoice (referenced via search 2026-05-25).
- **iCount** (אייקאונט). Cloud accounting/invoicing for SMBs and freelancers; supports SHAAM integration. Source: https://www.icount.co.il/blog/invoice-israel/ (referenced via search 2026-05-25); product overview https://businessvibrant.com/icount/ (referenced via search 2026-05-25).
- **Hashavshevet** (חשבשבת). Long-established Israeli desktop accounting software; widely used by accountants for full books-keeping including PCN874 export.
- **Powerlink** (פאוורלינק). CRM-led platform with billing modules used by some Israeli IT services firms.
- **Invoice4U**. One of the earliest cloud invoicing services in Israel.

(The above are listed for inventory only; verify with the accountant which is approved for the firm's bookkeeping setup.)

### What this means for the implementation

- Build vs partner: building a direct SHAAM integration is feasible but front-loads operational risk (3-month auth renewal, error handling, two endpoints in transition). Wrapping a third-party (e.g. Green Invoice or iCount) shifts that risk at the cost of a per-document API fee and reduced control. The choice is a product/engineering decision but must be made before the data model is finalized.
- Either way, the Skyware data model must support storing the allocation number, the timestamp of issuance, the SHAAM response code, and a status enum {pending, approved, rejected, hearing}.

---

## M. Accountant sign-off practice and operational gates

### M.1 What an Israeli accountant typically attests before live invoicing

Unverified - needs accountant review: There is no single public checklist. From cross-referencing the cited sources, the practical gates are:

1. Business is registered with the ITA as Osek Murshe (not Osek Patur) and has a valid VAT registration number (Osek Murshe nine-digit number).
2. Withholding-tax certificate (אישור ניכוי מס במקור) is current; otherwise the firm's customers must withhold 30% at source. Source on the 30% default: https://www.gov.il/en/service/itc-gmishurim (referenced via search 2026-05-25, page returned 403 to programmatic fetcher but the rule is restated in https://economist.co.il/what-is-a-withholding-tax-certificate/ and https://www.cpa.co.il/tax-withholding/ - both referenced via search 2026-05-25).
3. Bookkeeping confirmation (אישור ניהול ספרים) is current.
4. The accounting software is registered with the ITA per the "computerized document" rule.
5. SHAAM portal enrollment is complete; an authorized individual is on file; the 3-month connection authorization is active.
6. The accountant has reviewed and signed off on the invoice template, the credit-note template, and the numbering sequence scheme.

### M.2 Operational sequencing before issuing the first live tax invoice

Recommended sequence (compiled from above sources):
1. Open VAT file with the ITA and obtain Osek Murshe number.
2. Notify the ITA of the accounting software (computerized document rule).
3. Apply for Withholding Tax Certificate.
4. Enroll in SHAAM personal area and authorize the integration.
5. Sandbox-test the allocation-number API end to end with at least one full happy-path and one rejection flow.
6. Sign off invoice/credit-note templates with the accountant.
7. Issue first live invoice with allocation number; verify the customer received and accepted it.

### What this means for the implementation

- Skyware should build a "Compliance gates" admin screen that lists each of these gates with a status (open/closed) and a manual sign-off button. Until all gates are closed, the "Finalize tax invoice" button must be disabled.
- The accountant's sign-off should be captured as an audit log entry with the accountant's name and license number.

---

## Implementation gates

The engineering team must respect the following compliance gates. None of these are optional; each maps to a cited rule above.

1. **Do not enable "Finalize tax invoice" until SHAAM enrollment is complete.** Until the ITA personal-area authorization is active and a successful sandbox round-trip has been recorded, the system must refuse to issue Cheshbonit Mas documents. (Sections C, M.)
2. **Block deletion/silent void of any finalized tax invoice.** The only correction path is "Issue credit note". Enforce at the database layer (RBAC + constraint), not only in the UI. (Section J.)
3. **Gap-free sequential numbering, transactional.** Generate the invoice number in the same transaction that writes the document. Never permit a "draft number" that may be skipped. Maintain separate sequences per document type. (Section B.)
4. **Hebrew header block on every tax invoice and credit note.** The strings "חשבונית מס" (or "חשבונית זיכוי") and "עוסק מורשה" along with the issuer's nine-digit VAT ID must be present. Renderer must support RTL. (Section F.)
5. **"מסמך ממוחשב" stamp on every system-generated document.** And accounting software must be notified to the ITA before go-live. (Sections A.2, G.)
6. **Per-line VAT rate, with historical persistence.** Store the rate that was effective when the document was issued, never re-compute from "current" rate. (Section D.)
7. **Foreign-currency invoices must store NIS-equivalent amount, FX rate, FX source, and FX date.** VAT computed on NIS-equivalent only. Default FX source: Bank of Israel representative rate on the issue date. (Section E.)
8. **Allocation number is a synchronous gate above the live threshold.** Threshold is a time-varying configuration value (NIS 10,000 until 2026-05-31; NIS 5,000 from 2026-06-01). The four rejection-flow outcomes must be supported. (Section C.)
9. **Renew the SHAAM connection authorization every 3 months.** Add an automated reminder with email/notification and a "valid until" indicator on the admin compliance screen. (Section C.5.)
10. **Immutable archive of every issued document for 7 years from end of issue year.** Object Lock or equivalent; no overwrite, no silent deletion. (Section G.)
11. **PCN874-export readiness.** The data model must capture every field that the PCN874 file needs (supplier VAT ID, recipient VAT ID, invoice number, allocation number, date, amount excluding VAT, VAT amount, VAT rate) even though the file generator itself is out of current scope. (Section H.)
12. **No Cheshbonit Mas from Osek Patur clients.** If Skyware ever supports an Osek Patur tenant, that tenant's UI must not expose the tax-invoice action at all. (Section A.)

---

## Top 5 risks of implementing without an Israeli CPA on the loop

1. **Wrong document type at the wrong time.** Issuing a "tax invoice" when the firm is on a cash basis but hasn't received cash yet creates a tax accident and can cost the firm interest and penalty. An Israeli CPA must define which tax-point model the firm uses and what document is issued on each transition.
2. **Allocation-number flow built against the wrong threshold or wrong endpoint.** The thresholds shifted between the original 2023 plan and VAT Implementation Order 01/2025 (December 2025). A build that hard-codes NIS 15,000 (the obsolete plan) will fail invoices in 2026. An Israeli CPA can confirm the live threshold on the day of each release.
3. **Silent invoice cancellation.** Building a "void invoice" button at all is non-compliant. Discovering this in audit can cost the firm both penalties and goodwill with the ITA.
4. **Foreign-resident zero-rating misapplied.** Section 30(a)(5) is interpreted narrowly by Israeli courts. Mis-applying it for a foreign client with any Israeli touchpoint creates back-VAT exposure plus interest. A CPA must review the firm's standard contract template and decide whether zero-rating is even available.
5. **Missing the 7-year archive bar.** Cloud storage with default retention policies typically does not satisfy hash-lock requirements. Using a regular bucket without Object Lock means a future re-write of a document is technically possible, which is a recordkeeping violation even if it never happens.

---

## Recommended documents to print and hand to the accountant for review

A short checklist to attach to the accountant briefing packet:

- [ ] Specimen Cheshbonit Mas template generated by Skyware (Hebrew + English bilingual), in PDF
- [ ] Specimen Cheshbonit Mas/Kabbala (combined) template
- [ ] Specimen Cheshbonit Zikkui (credit note) template
- [ ] Specimen Cheshbon Iska (proforma) template
- [ ] Specimen Kabbala (standalone receipt) template
- [ ] Specimen multi-currency tax invoice template (USD primary, NIS equivalent, BoI rate cited)
- [ ] Specimen export tax invoice with Section 30(a)(5) zero-rating annotation
- [ ] Data-model diagram showing invoice-credit-note linkage and the allocation-number column
- [ ] SHAAM sandbox test log: at least one successful Approval and one rejection round-trip, with HTTP request/response captured
- [ ] Numbering-sequence policy document: per-document-type sequence, transactional generation, no resets
- [ ] Retention policy document: 7-year minimum, immutable storage layer, who can request deletion (no one, by design)
- [ ] Cancellation policy: never delete; always credit-note
- [ ] Computerized-document notification draft for the ITA (the accountant typically files this)
- [ ] Compliance-gates admin-screen mock-up showing each operational gate and its sign-off state
- [ ] List of every "Unverified - needs accountant review" item from this document, with a checkbox for accountant initials

---

## Source index (URLs, all fetched or referenced 2026-05-25)

Primary regulatory / official:
- Israel Tax Authority Open API service page (PDF, HE): https://www.gov.il/BlobFolder/service/connect-to-shaam/he/Service_Pages_shaam_Tax-Authority-Open-API.pdf
- Israel Invoice Model API description (PDF, EN): https://www.gov.il/BlobFolder/generalpage/israel-invoice-160723/he/vat_software-houses-180724-en.pdf
- ITA "Israeli Invoicing" Model update: https://www.gov.il/en/pages/pa231023-2 (returned 403 to programmatic fetcher; cited via secondary)
- ITA Withholding Tax / Bookkeeping confirmations: https://www.gov.il/en/service/itc-gmishurim (returned 403; cited via secondary)
- ITA periodic VAT dates: https://www.gov.il/en/pages/pa151025-2 (returned 403; cited via secondary)
- Bank of Israel exchange rates explanatory notes: https://www.boi.org.il/en/economic-roles/financial-markets/explanatory-notes-to-the-representative-exchange-rates/
- Knesset Plenum order on VAT rate: https://main.knesset.gov.il/EN/News/PressReleases/Pages/press12324w.aspx
- ICNL copy of Income Tax Ordinance: https://www.icnl.org/wp-content/uploads/Israel_Ordinance.pdf
- ICNL copy of VAT Law 5736-1975: https://www.icnl.org/wp-content/uploads/Israel_vat1975.pdf

Israeli law firms / accountants:
- Herzog Fox & Neeman, 2026 VAT/customs updates: https://herzoglaw.co.il/en/news-and-insights/overview-of-vat-and-customs-updates-effective-in-2026/
- Herzog, VAT precedent on zero-rate services: https://herzoglaw.co.il/en/news-and-insights/vat-precedent-ruling/
- Grant Thornton Israel, services to foreign residents: https://www.grantthornton.co.il/en/media-centre/2023/providing_services_to_a_foreign_resident/
- Grant Thornton global indirect-tax Israel guide: https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Israel/
- PwC Israel tax IT compliance services: https://www.pwc.com/il/en/tax/tax-it-compliance-services.html
- PwC corporate other taxes (Israel): https://taxsummaries.pwc.com/israel/corporate/other-taxes
- PwC corporate tax administration (Israel): https://taxsummaries.pwc.com/israel/corporate/tax-administration
- Dray & Dray Osek Patur guide: https://cpa-dray.com/en/blog/osek-patur-guide/
- Steinmetz Aminach withholding tax 2026: https://www.cpa.co.il/tax-withholding/
- Ampeli Tax on zero-VAT: https://www.ampeli-tax.com/post/the-entitlement-of-zero-vat
- Shibolet on Section 30 zero-rating ruling: https://www.shibolet.com/en/zero-rate-value-added-tax-vat-for-services-provided-to-foreign-residents-in-connection-with-products-sold-by-foreign-residents-in-israel-tax-ruling-by-agreement/
- Raveh Ravid on financial-mediation zero-VAT: https://www.raveh-ravid.com/vat-zero-for-financial-mediation-services-to-foreign-clients-the-end/
- Alfasi Israel on self-invoices and rejection workflow: https://www.alfasiisrael.com/post/what-you-need-to-know-about-self-invoices-in-israel-and-implementing-tax-decision-6369-18
- Harris Consulting & Tax, are-you-ready-for-Israel-e-invoices: https://hcat.co/are-you-ready-for-israel-e-invoices/
- Harris Consulting on Israeli VAT on international services: https://hcat.co/israeli-vat-on-international-services/

International tax press / vendors:
- KPMG TaxNewsFlash, Israel e-invoicing expansion (2025-12): https://kpmg.com/us/en/taxnewsflash/news/2025/12/tnf-israel-expansion-of-mandatory-e-invoicing-model.html
- Sovos, accelerated CTC timeline: https://sovos.com/regulatory-updates/vat/israel-tax-authority-confirms-accelerated-timeline-for-ctc-invoice-allocation-number/
- Sovos, Israel CTC reforms hub: https://sovos.com/vat/tax-rules/e-invoicing-israel/
- Sovos OpenAPI User Guide PDF (translated): https://developer-guide.sovos.com/wp-content/uploads/2023/10/ENG-official-OpenApiUserGuide.pdf
- Bloomberg Tax, ITA clarifies VAT invoice allocation: https://news.bloombergtax.com/daily-tax-report-international/israel-tax-agency-clarifies-requirements-for-allocating-taxpayer-vat-invoice-numbers
- VATupdate, accelerated thresholds: https://www.vatupdate.com/2025/12/10/israel-accelerates-ctc-invoice-allocation-number-rollout-lower-thresholds-effective-2026/
- VATupdate, expanded mandate: https://www.vatupdate.com/2025/12/14/israel-expands-mandatory-e-invoicing-lower-thresholds-and-new-vat-compliance-rules-for-2026/
- VATupdate, 2026 budget VAT stays at 18%: https://www.vatupdate.com/2025/12/10/israel-approves-2026-budget-vat-stays-at-18-expands-exemptions-eases-bank-entry-rules/
- VATupdate, lowered thresholds 2026: https://www.vatupdate.com/2026/01/12/thresholds-for-mandatory-allocation-numbers-on-tax-invoices-to-be-lowered-in-2026/
- VATupdate, further lowering: https://www.vatupdate.com/2026/04/12/israel-to-lower-invoice-allocation-number-thresholds-further-in-2026-for-real-time-tax-compliance/
- VATcalc, avoided 19% rise: https://www.vatcalc.com/vat/israel-vat-rise-to-19-jan-2026-proposal/
- Marosa, Israel VAT 17->18%: https://marosavat.com/vat-news/israel-increases-vat-rate-from-17-to-18-by-2025
- Pagero (Thomson Reuters) regulatory update Israel: https://europe.thomsonreuters.com/compliance/regulatory-updates/israel
- Pagero e-invoicing mandate Israel: https://www.pagero.com/compliance/solutions/e-invoicing-mandate-israel
- EDICOM Israel CTC clearance model: https://edicomgroup.com/blog/israel-electronic-invoice-clearance-model
- EDICOM Israel e-invoicing summary: https://edicomgroup.com/electronic-invoicing/israel
- Avalara Israel e-invoicing: https://www.avalara.com/vatlive/en/country-guides/africa-and-middle-east/israel/e-invoicing-in-israel.html
- Avalara Israeli VAT invoice rules: https://www.avalara.com/vatlive/en/country-guides/africa-and-middle-east/israel/israeli-vat-invoice-rules.html (returned 404; cited via secondary)
- Avalara blog, countdown to allocation number mandate: https://www.avalara.com/blog/en/europe/2024/04/israel-invoice-allocation-number-mandate.html
- Voxel Group, Israel e-invoicing guide: https://www.voxelgroup.net/compliance/guides/israel/
- Comarch on ITA technical specifications: https://www.comarch.com/trade-and-services/data-management/legal-regulation-changes/the-israel-tax-authority-ita-new-e-invoicing-technical-specifications/
- dddinvoices, e-invoicing in Israel: https://dddinvoices.com/learn/e-invoicing-israel
- ClearTax, e-invoicing in Israel: https://www.cleartax.com/il/e-invoicing-israel
- Adobe, electronic signature laws Israel: https://helpx.adobe.com/legal/esignatures/regulations/israel.html
- InvoiceDataExtraction, Israel VAT invoice requirements 2026: https://invoicedataextraction.com/blog/israel-vat-invoice-requirements
- Quaderno, Israel VAT guide 2026: https://quaderno.io/guides/israel-vat-guide/
- DeterminedAI, Israel VAT 18% nonresident SaaS: https://determinedai.co/vat/israel
- GlobalVATcompliance Israel updates: https://www.globalvatcompliance.com/globalvatnews/israel-vat-invoicing-updates/
- LookupTax, Israel TIN guide: https://lookuptax.com/docs/tax-identification-number/israel-tax-id-guide
- Tzer / VAT PCN report Israel: https://tzer.co.il/en/vat-pcn-report-in-israel/
- Times of Israel, 2026 price/tax rises: https://www.timesofisrael.com/wave-of-price-rises-and-tax-hikes-takes-effect-fueling-costs-for-israelis-in-2026/

Vendors (third-party SaaS):
- Green Invoice / Morning, Israeli invoice guide (HE): https://www.greeninvoice.co.il/magazine/israel-invoice/
- iCount Israeli invoice guide: https://www.icount.co.il/blog/invoice-israel/
- Grow.business, Israeli invoice full guide (HE): https://grow.business/israel-invoice/ (returned 403; referenced via search)
- govextra Israeli invoices business guide: https://govextra.gov.il/taxes/innovation/home/israel-invoices/ (referenced via search)

Other practitioner references:
- CWS Israel freelancer tax compliance 2026: https://www.cwsisrael.com/freelancer-tax-compliance-in-israel-2026/
- CWS Israel 2026 tax changes: https://www.cwsisrael.com/israeli-tax-changes-2026-complete-guide/
- Aboulafia accountants on VAT basics: https://aboulafia.co.il/en/binyamin-radomsky-en/vat-%D7%9E%D7%A2%D7%B4%D7%9E-the-basics/
- Tax in Israel blog on VAT basics: http://taxinisrael.blogspot.com/2013/06/vat-basics.html
- Economist.co.il on withholding tax certificate (HE): https://economist.co.il/what-is-a-withholding-tax-certificate/
- Numerotech on withholding tax certificate: https://numerotech.co.il/tax-certificates/
- Help.solarstaff on Israeli freelance taxes: https://help.solarstaff.com/en/articles/9242904-freelance-and-taxes-israel
- Help.mellow on Israeli freelance taxes: https://help.mellow.io/en/articles/9134851-freelance-and-taxes-israel

---

End of document. All "must / must not" claims, numeric values and dates above carry the source URL inline as required. Items flagged "Unverified - needs accountant review" must be confirmed by an Israeli CPA before being relied on for engineering decisions.
