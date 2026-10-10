import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { DOCUMENT_TEMPLATES, DOCUMENT_WORDING, renderBusinessDocument, type DocumentSettings } from "@designs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { DesignSvg } from "../designs/DesignSvg";
import { kindPath, saveDocumentSettings, type Business, type DocumentKind } from "./api";
import { businessKeys } from "./BusinessesListPage";
import { useBusinessOutletContext } from "./BusinessLayout";
import { DocumentPreview, emptyDraft, type DocumentDraft } from "./DocumentEditor";

function sampleDraft(kind: DocumentKind, settings: DocumentSettings): DocumentDraft {
  let key = 1000;
  return {
    ...emptyDraft(kind, settings),
    clientName: "Bright Futures Foundation",
    clientEmail: "accounts@brightfutures.org",
    clientAddress: "12 Siaka Stevens Street, Freetown",
    paymentMethod: kind === "receipt" ? "Orange Money" : "",
    items: [
      { key: key++, description: "Event planning and coordination", quantity: "1", unitPrice: "2500" },
      { key: key++, description: "Printed ID cards", quantity: "120", unitPrice: "15" },
      { key: key++, description: "Venue decoration", quantity: "1", unitPrice: "800" },
    ],
    amountPaid: kind === "receipt" ? "5100" : "",
    customFields: Object.fromEntries(settings.customFields.map((f) => [f.key, "Sample"])),
  };
}

function TemplateThumb({ business, settings, kind, active, onSelect, name, description }: { business: Business; settings: DocumentSettings; kind: DocumentKind; active: boolean; onSelect: () => void; name: string; description: string }) {
  const svg = React.useMemo(() => {
    const draft = sampleDraft(kind, settings);
    return renderBusinessDocument(
      {
        kind,
        number: `${settings.prefix}-0001`,
        status: draft.status,
        issueDate: draft.issueDate,
        dueDate: draft.dueDate,
        client: { name: draft.clientName },
        items: draft.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
        discount: 0,
        taxRate: 0,
        amountPaid: 0,
        customFields: [],
        currency: business.currency,
      },
      { ...business, logo: business.logoUrl },
      settings,
    )[0]!;
  }, [business, settings, kind]);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn("flex flex-col gap-2 rounded-xl border-2 p-2 text-sm font-medium transition", active ? "border-primary shadow-glow" : "border-border/70 hover:border-primary/40")}
    >
      <DesignSvg svg={svg} label={`${name} layout`} className="mx-auto max-h-64 w-auto rounded-md border border-border/50 bg-white" />
      <span className="text-left">
        <span className="block">{name}</span>
        <span className="block text-xs font-normal text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function DocumentSettingsPage({ kind }: { kind: DocumentKind }) {
  const { business } = useBusinessOutletContext();
  const noun = DOCUMENT_WORDING[kind].noun;
  usePageMeta({ title: `${noun} design · ${business.name}` });
  const queryClient = useQueryClient();
  const initial = kind === "invoice" ? business.invoiceSettings : kind === "receipt" ? business.receiptSettings : business.quotationSettings;
  const [settings, setSettings] = React.useState<DocumentSettings>(initial);
  const [saving, setSaving] = React.useState(false);
  const set = (patch: Partial<DocumentSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const canEdit = business.myRole === "admin";
  const draft = React.useMemo(() => sampleDraft(kind, settings), [kind, settings]);

  const save = async () => {
    const keys = settings.customFields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) return toast.error("Two extra fields have the same name");
    setSaving(true);
    try {
      await saveDocumentSettings(business.id, kind, settings);
      await queryClient.invalidateQueries({ queryKey: businessKeys.detail(business.id) });
      toast.success(`${noun} design saved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const text = (key: "title" | "prefix" | "taxLabel" | "footer" | "signatureLabel") => ({
    id: `settings-${key}`,
    value: settings[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: e.target.value }),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <LinkButton to={`/admin/businesses/${business.id}/${kindPath(kind)}`} variant="ghost" size="sm" className="self-start px-0">
            <ArrowLeft className="h-4 w-4" />
            All {noun.toLowerCase()}s
          </LinkButton>
          <h2 className="text-lg font-semibold">{noun} design</h2>
          <p className="text-sm text-muted-foreground">
            How {noun.toLowerCase()}s from {business.name} look, what they ask for, and what they say by default.
          </p>
        </div>
        {canEdit && (
          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" />
            Save design
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Layout</CardTitle>
              <CardDescription>Your logo and business details from the Overview tab appear at the top.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {DOCUMENT_TEMPLATES.filter((t) => t.kinds.includes(kind)).map((t) => (
                  <TemplateThumb
                    key={t.id}
                    business={business}
                    kind={kind}
                    name={t.name}
                    description={t.description}
                    settings={{ ...settings, template: t.id }}
                    active={settings.template === t.id}
                    onSelect={() => set({ template: t.id })}
                  />
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-accent">Accent colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick the accent colour"
                      value={settings.accentColor}
                      onChange={(e) => set({ accentColor: e.target.value })}
                      className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                    />
                    <Input id="settings-accent" className="font-mono" value={settings.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-title">Heading</Label>
                  <Input {...text("title")} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                  <Label htmlFor="settings-showLogo">Show logo</Label>
                  <Switch id="settings-showLogo" checked={settings.showLogo} onCheckedChange={(v) => set({ showLogo: v })} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                  <Label htmlFor="settings-showDetails">Show business address and contacts</Label>
                  <Switch id="settings-showDetails" checked={settings.showBusinessDetails} onCheckedChange={(v) => set({ showBusinessDetails: v })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Numbers and tax</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-prefix">Number prefix</Label>
                <Input {...text("prefix")} className="uppercase" maxLength={12} />
                <p className="text-xs text-muted-foreground">
                  e.g. {settings.prefix.toUpperCase() || "INV"}-0001. Applies to new {noun.toLowerCase()}s.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-taxLabel">Tax name</Label>
                <Input {...text("taxLabel")} placeholder="Tax, GST, VAT" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-taxRate">Default tax rate (%)</Label>
                <Input
                  id="settings-taxRate"
                  inputMode="decimal"
                  value={String(settings.defaultTaxRate)}
                  onChange={(e) => set({ defaultTaxRate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                />
              </div>
              {kind !== "receipt" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-dueDays">{kind === "quotation" ? "Valid for (days)" : "Payment due after (days)"}</Label>
                  <Input
                    id="settings-dueDays"
                    inputMode="numeric"
                    value={String(settings.dueDays)}
                    onChange={(e) => set({ dueDays: Math.min(365, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extra fields</CardTitle>
              <CardDescription>Your own questions on the {noun.toLowerCase()} form, like a PO number or project name. They print beside the client details.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {settings.customFields.map((field, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Extra field ${i + 1} name`}
                    value={field.label}
                    placeholder="Field name"
                    onChange={(e) => {
                      const labelText = e.target.value;
                      set({
                        customFields: settings.customFields.map((f, index) =>
                          index === i ? { key: labelText.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${i + 1}`, label: labelText } : f,
                        ),
                      });
                    }}
                  />
                  <Button variant="ghost" size="icon" aria-label={`Remove extra field ${i + 1}`} onClick={() => set({ customFields: settings.customFields.filter((_, index) => index !== i) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {settings.customFields.length < 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => set({ customFields: [...settings.customFields, { key: `field_${settings.customFields.length + 1}`, label: "" }] })}
                >
                  <Plus className="h-4 w-4" />
                  Add a field
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Default text</CardTitle>
              <CardDescription>Filled in on every new {noun.toLowerCase()}; you can still change it each time.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {kind !== "receipt" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-payment">{kind === "quotation" ? "Payment terms" : "Payment details"}</Label>
                  <Textarea
                    id="settings-payment"
                    rows={3}
                    placeholder="Bank name, account number, mobile money number..."
                    value={settings.paymentDetails}
                    onChange={(e) => set({ paymentDetails: e.target.value })}
                  />
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-notes">Notes</Label>
                  <Textarea id="settings-notes" rows={3} value={settings.defaultNotes} onChange={(e) => set({ defaultNotes: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-terms">Terms</Label>
                  <Textarea id="settings-terms" rows={3} value={settings.defaultTerms} onChange={(e) => set({ defaultTerms: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-signatureLabel">Signature line</Label>
                  <Input {...text("signatureLabel")} placeholder="Leave empty for no signature line" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-footer">Footer</Label>
                  <Input {...text("footer")} placeholder="e.g. Registered in Sierra Leone" />
                </div>
              </div>
            </CardContent>
          </Card>
        </fieldset>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Preview with sample details</p>
          <DocumentPreview kind={kind} business={business} settings={settings} draft={draft} number={`${settings.prefix.toUpperCase()}-0001`} />
        </div>
      </div>
    </div>
  );
}

export const InvoiceSettingsPage = () => <DocumentSettingsPage kind="invoice" />;
export const ReceiptSettingsPage = () => <DocumentSettingsPage kind="receipt" />;

export const QuotationSettingsPage = () => <DocumentSettingsPage kind="quotation" />;
