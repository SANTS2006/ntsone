import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  computeTotals,
  DOCUMENT_WORDING,
  formatMoney,
  renderBusinessDocument,
  type DocumentSettings,
  type LineItem,
} from "@designs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DesignSvg } from "../designs/DesignSvg";
import type { Business, BusinessDocument, DocumentInput, DocumentKind } from "./api";
import { statusLabel } from "./statuses";

/** Line items are edited as text so half-typed numbers like "1." don't get in the way. */
export interface DraftItem {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface DocumentDraft {
  status: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  items: DraftItem[];
  discount: string;
  taxRate: string;
  amountPaid: string;
  notes: string;
  terms: string;
  customFields: Record<string, string>;
}

let itemKey = 0;
const blankItem = (): DraftItem => ({ key: itemKey++, description: "", quantity: "1", unitPrice: "" });
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function emptyDraft(kind: DocumentKind, settings: DocumentSettings, firstStatus?: string): DocumentDraft {
  const today = new Date();
  const due = new Date(today.getTime() + settings.dueDays * 24 * 60 * 60 * 1000);
  return {
    status: firstStatus ?? (kind === "receipt" ? "issued" : "draft"),
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    issueDate: isoDay(today),
    dueDate: kind === "receipt" ? isoDay(today) : isoDay(due),
    paymentMethod: "",
    items: [blankItem()],
    discount: "",
    taxRate: settings.defaultTaxRate ? String(settings.defaultTaxRate) : "",
    amountPaid: "",
    notes: settings.defaultNotes,
    terms: settings.defaultTerms,
    customFields: {},
  };
}

export function draftFromDocument(doc: BusinessDocument): DocumentDraft {
  const amount = (v: number) => (v ? String(v) : "");
  return {
    status: doc.status,
    clientName: doc.clientName,
    clientEmail: doc.clientEmail ?? "",
    clientPhone: doc.clientPhone ?? "",
    clientAddress: doc.clientAddress ?? "",
    issueDate: doc.issueDate.slice(0, 10),
    dueDate: doc.dueDate ? doc.dueDate.slice(0, 10) : "",
    paymentMethod: doc.paymentMethod ?? "",
    items: doc.items.map((i) => ({ key: itemKey++, description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })),
    discount: amount(doc.discount),
    taxRate: amount(doc.taxRate),
    amountPaid: amount(doc.amountPaid),
    notes: doc.notes ?? "",
    terms: doc.terms ?? "",
    customFields: { ...doc.customFields },
  };
}

const toNumber = (value: string) => {
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function draftItems(draft: DocumentDraft): LineItem[] {
  return draft.items
    .filter((i) => i.description.trim() || i.unitPrice.trim())
    .map((i) => ({ description: i.description.trim(), quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice) }));
}

/** Checks the draft and turns it into what the API expects, or returns what needs fixing. */
export function toInput(draft: DocumentDraft): { input?: DocumentInput; error?: string } {
  if (!draft.clientName.trim()) return { error: "Enter who this is for" };
  const items = draftItems(draft);
  if (items.length === 0) return { error: "Add at least one item" };
  if (items.some((i) => !i.description)) return { error: "Every item needs a description" };
  if (draft.clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.clientEmail.trim())) return { error: "Enter a valid client email" };
  return {
    input: {
      status: draft.status,
      clientName: draft.clientName.trim(),
      clientEmail: draft.clientEmail.trim() || null,
      clientPhone: draft.clientPhone.trim() || null,
      clientAddress: draft.clientAddress.trim() || null,
      issueDate: draft.issueDate,
      dueDate: draft.dueDate || null,
      paymentMethod: draft.paymentMethod.trim() || null,
      items,
      discount: toNumber(draft.discount),
      taxRate: Math.min(100, toNumber(draft.taxRate)),
      amountPaid: toNumber(draft.amountPaid),
      notes: draft.notes.trim() || null,
      terms: draft.terms.trim() || null,
      customFields: draft.customFields,
    },
  };
}

/** The document as it will print, page by page, drawn with the same renderer as the downloads. */
export function DocumentPreview({
  kind,
  business,
  settings,
  draft,
  number,
  updatedOn,
}: {
  kind: DocumentKind;
  business: Business;
  settings: DocumentSettings;
  draft: DocumentDraft;
  number: string;
  updatedOn?: string | null;
}) {
  const [page, setPage] = React.useState(0);
  const pages = React.useMemo(
    () =>
      renderBusinessDocument(
        {
          kind,
          number,
          status: draft.status,
          updatedOn,
          issueDate: draft.issueDate || new Date().toISOString(),
          dueDate: draft.dueDate || null,
          paymentMethod: draft.paymentMethod || null,
          client: { name: draft.clientName || "Client name", email: draft.clientEmail, phone: draft.clientPhone, address: draft.clientAddress },
          items: draftItems(draft),
          discount: toNumber(draft.discount),
          taxRate: toNumber(draft.taxRate),
          amountPaid: toNumber(draft.amountPaid),
          notes: draft.notes,
          terms: draft.terms,
          customFields: settings.customFields.map((f) => ({ label: f.label, value: draft.customFields[f.key] ?? "" })),
          currency: business.currency,
        },
        { ...business, logo: business.logoUrl },
        settings,
      ),
    [kind, number, updatedOn, draft, business, settings],
  );
  const current = Math.min(page, pages.length - 1);

  return (
    <div className="flex flex-col gap-2">
      <DesignSvg
        svg={pages[current]!}
        label={`${DOCUMENT_WORDING[kind].noun} preview, page ${current + 1} of ${pages.length}`}
        className="rounded-lg border border-border/70 bg-white shadow-lg"
      />
      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="icon" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums text-muted-foreground">
            Page {current + 1} of {pages.length}
          </span>
          <Button variant="outline" size="icon" aria-label="Next page" disabled={current === pages.length - 1} onClick={() => setPage(current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** The form for an invoice or receipt, with its live preview beside it. */
export function DocumentEditor({
  kind,
  business,
  settings,
  draft,
  onChange,
  number,
  updatedOn,
  actions,
}: {
  kind: DocumentKind;
  business: Business;
  settings: DocumentSettings;
  draft: DocumentDraft;
  onChange: (draft: DocumentDraft) => void;
  number: string;
  updatedOn?: string | null;
  actions: React.ReactNode;
}) {
  const set = (patch: Partial<DocumentDraft>) => onChange({ ...draft, ...patch });
  const text = (key: keyof Pick<DocumentDraft, "clientName" | "clientEmail" | "clientPhone" | "clientAddress" | "paymentMethod" | "notes" | "terms">) => ({
    id: `doc-${key}`,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [key]: e.target.value }),
  });
  const setItem = (index: number, patch: Partial<DraftItem>) => set({ items: draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const totals = computeTotals(draftItems(draft), toNumber(draft.discount), toNumber(draft.taxRate), toNumber(draft.amountPaid));
  const money = (v: number) => formatMoney(v, business.currency);
  const statuses = business.statusConfig[kind];
  // A document can carry a status its business has since removed; keep it selectable.
  const statusChoices = statuses.some((s) => s.key === draft.status) || !draft.status ? statuses : [...statuses, { key: draft.status, label: statusLabel(statuses, draft.status), color: "gray" as const }];
  const who = kind === "invoice" ? "Bill to" : kind === "quotation" ? "Prepared for" : "Received from";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{who}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="doc-clientName">Name</Label>
              <Input {...text("clientName")} placeholder="Client or company name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-clientEmail">Email</Label>
              <Input type="email" {...text("clientEmail")} placeholder="Used when you send it by email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-clientPhone">Phone</Label>
              <Input {...text("clientPhone")} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="doc-clientAddress">Address</Label>
              <Input {...text("clientAddress")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-issueDate">{DOCUMENT_WORDING[kind].dateLabel}</Label>
              <Input id="doc-issueDate" type="date" value={draft.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-dueDate">{DOCUMENT_WORDING[kind].endLabel}</Label>
              <Input id="doc-dueDate" type="date" value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-paymentMethod">Payment method</Label>
              <Input {...text("paymentMethod")} placeholder="e.g. Cash, Bank transfer, Orange Money" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(status) => set({ status })}>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusChoices.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {settings.customFields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`doc-custom-${field.key}`}>{field.label}</Label>
                <Input
                  id={`doc-custom-${field.key}`}
                  value={draft.customFields[field.key] ?? ""}
                  onChange={(e) => set({ customFields: { ...draft.customFields, [field.key]: e.target.value } })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="hidden grid-cols-[1fr_80px_120px_110px_40px] gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {draft.items.map((item, i) => (
              <div key={item.key} className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[1fr_80px_120px_110px_40px] sm:items-center sm:border-0 sm:p-0">
                <Input
                  aria-label={`Item ${i + 1} description`}
                  placeholder="Description"
                  className="col-span-2 sm:col-span-1"
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
                <Input
                  aria-label={`Item ${i + 1} quantity`}
                  inputMode="decimal"
                  className="text-right"
                  value={item.quantity}
                  onChange={(e) => setItem(i, { quantity: e.target.value })}
                />
                <Input
                  aria-label={`Item ${i + 1} unit price`}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-right"
                  value={item.unitPrice}
                  onChange={(e) => setItem(i, { unitPrice: e.target.value })}
                />
                <span className="self-center text-right text-sm font-medium tabular-nums">{money(toNumber(item.quantity) * toNumber(item.unitPrice))}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove item ${i + 1}`}
                  disabled={draft.items.length === 1}
                  onClick={() => set({ items: draft.items.filter((_, index) => index !== i) })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => set({ items: [...draft.items, blankItem()] })}>
              <Plus className="h-4 w-4" />
              Add item
            </Button>

            <div className="ml-auto grid w-full max-w-sm gap-2 border-t border-border/70 pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{money(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="doc-discount" className="font-normal text-muted-foreground">
                  Discount ({business.currency === "SLE" ? "Le" : business.currency})
                </Label>
                <Input id="doc-discount" inputMode="decimal" className="h-8 w-32 text-right" value={draft.discount} onChange={(e) => set({ discount: e.target.value })} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="doc-taxRate" className="font-normal text-muted-foreground">
                  {settings.taxLabel} (%)
                </Label>
                <Input id="doc-taxRate" inputMode="decimal" className="h-8 w-32 text-right" value={draft.taxRate} onChange={(e) => set({ taxRate: e.target.value })} />
              </div>
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(totals.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="doc-amountPaid" className="font-normal text-muted-foreground">
                  Amount paid
                </Label>
                <Input id="doc-amountPaid" inputMode="decimal" className="h-8 w-32 text-right" value={draft.amountPaid} onChange={(e) => set({ amountPaid: e.target.value })} />
              </div>
              {(totals.amountPaid > 0 || kind === "receipt") && kind !== "quotation" && (
                <div className="flex items-center justify-between font-medium">
                  <span>{kind === "invoice" ? "Balance due" : "Balance"}</span>
                  <span className="tabular-nums">{money(totals.balance)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes and terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-notes">Notes</Label>
              <Textarea rows={3} {...text("notes")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-terms">Terms</Label>
              <Textarea rows={3} {...text("terms")} />
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-sm font-medium text-muted-foreground">Live preview</p>
        <DocumentPreview kind={kind} business={business} settings={settings} draft={draft} number={number} updatedOn={updatedOn} />
      </div>
    </div>
  );
}
