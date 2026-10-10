import { describe, expect, it } from "vitest";
import { computeTotals, DOCUMENT_TEMPLATES, defaultDocumentSettings, renderBusinessDocument, resolveDocumentSettings } from "../../src/shared/designs/index.js";
import { amountInWords } from "../../src/shared/designs/receiptLayouts.js";
import { DEFAULT_STATUSES, resolveStatuses, statusKeyFromLabel } from "../../src/shared/designs/businessStatuses.js";
import { dateLimitErrors } from "../../src/modules/registrations/validation.js";

describe("document totals", () => {
  it("applies the discount before tax and never lets it exceed the subtotal", () => {
    const t = computeTotals([{ description: "x", quantity: 2, unitPrice: 100 }], 50, 10, 0);
    expect(t).toMatchObject({ subtotal: 200, discount: 50, taxAmount: 15, total: 165, balance: 165 });
    expect(computeTotals([{ description: "x", quantity: 1, unitPrice: 10 }], 999, 0).total).toBe(0);
  });
});

describe("amount in words", () => {
  it("writes whole and fractional amounts", () => {
    expect(amountInWords(2450.5, "SLE")).toBe("Two thousand four hundred and fifty Leones and 50/100 only");
    expect(amountInWords(0, "USD")).toBe("Zero US dollars only");
    expect(amountInWords(1_000_001, "SLE")).toBe("One million and one Leones only");
  });
});

describe("statuses", () => {
  it("falls back to the defaults and builds safe keys from labels", () => {
    expect(resolveStatuses({}, "order")).toEqual(DEFAULT_STATUSES.order);
    expect(resolveStatuses({ order: [{ key: "a", label: "A", color: "nope" }] }, "order")[0]!.color).toBe("gray");
    expect(statusKeyFromLabel("Out for delivery!")).toBe("out_for_delivery");
  });
});

describe("date limits on forms", () => {
  const yearsAgo = (n: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
  };
  it("refuses people younger than the minimum age and older than the maximum", () => {
    expect(dateLimitErrors("DOB", "date_of_birth", { minAge: 18 }, yearsAgo(17))).toHaveLength(1);
    expect(dateLimitErrors("DOB", "date_of_birth", { minAge: 18 }, yearsAgo(30))).toHaveLength(0);
    expect(dateLimitErrors("DOB", "date_of_birth", { maxAge: 65 }, yearsAgo(70))).toHaveLength(1);
  });
  it("enforces earliest and latest dates", () => {
    expect(dateLimitErrors("D", "date", { minDate: "2026-12-01" }, "2026-11-30")).toHaveLength(1);
    expect(dateLimitErrors("D", "date", { maxDate: "2026-01-01" }, "2026-06-01")).toHaveLength(1);
    expect(dateLimitErrors("D", "date", { minDate: "2026-01-01", maxDate: "2026-12-31" }, "2026-06-01")).toHaveLength(0);
  });
});

describe("every document layout renders", () => {
  const business = { name: "Acme <script>alert(1)</script>", logo: null, email: null, phone: null, address: null, website: null, taxNumber: null };
  for (const kind of ["invoice", "receipt", "quotation"] as const) {
    for (const t of DOCUMENT_TEMPLATES.filter((x) => x.kinds.includes(kind))) {
      it(`${kind} / ${t.id}`, () => {
        const settings = { ...defaultDocumentSettings(kind), template: t.id };
        const pages = renderBusinessDocument(
          {
            kind,
            number: "X-1",
            status: "draft",
            issueDate: new Date(),
            client: { name: "<img src=x onerror=alert(1)>" },
            items: Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i}`, quantity: 1, unitPrice: 5 })),
            discount: 0,
            taxRate: 0,
            amountPaid: 0,
            customFields: [],
            currency: "SLE",
          },
          business,
          settings,
        );
        expect(pages.length).toBeGreaterThan(0);
        for (const svg of pages) {
          expect(svg.startsWith("<svg")).toBe(true);
          // User text is escaped, never injected as markup.
          expect(svg).not.toContain("<script>");
          expect(svg).not.toContain("<img src=x");
        }
      });
    }
  }
  it("an unknown stored layout falls back to a valid one", () => {
    expect(resolveDocumentSettings("receipt", { template: "slip-bold" }).template).toBe("slip-bold");
    expect(resolveDocumentSettings("invoice", { template: "slip" }).template).toBe("classic");
    expect(resolveDocumentSettings("invoice", { template: "nonsense" }).template).toBe("classic");
  });
});
