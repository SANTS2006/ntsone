import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { ArrowLeft, Download, FileDown, ImageDown, Mail, Plus, Printer, Save, Search, Trash2, IdCard } from "lucide-react";
import { CARD_TEMPLATES, cardTemplateInfo, renderBusinessCard, type CardContent as BusinessCardContent, type CardTemplate } from "@designs";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExportButtons } from "@/components/ExportButtons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { DesignSvg } from "../designs/DesignSvg";
import { printPages, savePagesAsPng } from "../designs/documentImage";
import { ImagePickerField } from "../idcards/IdCardSettingsCard";
import {
  createCard,
  deleteCard,
  downloadCardPdf,
  getCard,
  getCardPages,
  listCards,
  sendCard,
  updateCard,
  uploadBusinessImage,
  type Business,
  type BusinessCard,
  type CardInput,
} from "./api";
import { useBusinessOutletContext } from "./BusinessLayout";

const cardKeys = {
  list: (businessId: string, params: object) => ["business-cards", businessId, "list", params] as const,
  detail: (businessId: string, id: string) => ["business-cards", businessId, "detail", id] as const,
};

/** A QR code of the website as a module matrix, for the live preview. */
function qrFor(website: string | null | undefined): boolean[][] | null {
  const site = website?.trim();
  if (!site) return null;
  try {
    const target = /^https?:\/\//i.test(site) ? site : `https://${site}`;
    const q = QRCode.create(target, { errorCorrectionLevel: "M" });
    const size = q.modules.size;
    return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => Boolean(q.modules.get(r, c))));
  } catch {
    return null;
  }
}

function emptyCard(business: Business): CardInput {
  const info = CARD_TEMPLATES[0]!;
  return {
    name: "",
    jobTitle: "",
    company: business.name,
    phone: business.phone ?? "",
    email: business.email ?? "",
    website: business.website ?? "",
    address: business.address ?? "",
    tagline: "",
    photoUrl: null,
    template: info.id,
    primaryColor: info.primary,
    secondaryColor: info.secondary,
    showQr: true,
  };
}

const cardInputOf = (card: BusinessCard): CardInput => ({
  name: card.name,
  jobTitle: card.jobTitle ?? "",
  company: card.company,
  phone: card.phone ?? "",
  email: card.email ?? "",
  website: card.website ?? "",
  address: card.address ?? "",
  tagline: card.tagline ?? "",
  photoUrl: card.photoUrl,
  template: card.template,
  primaryColor: card.primaryColor,
  secondaryColor: card.secondaryColor,
  showQr: card.showQr,
});

function previewPages(business: Business, input: CardInput, qr: boolean[][] | null): [string, string] {
  const content: BusinessCardContent = {
    name: input.name || "Your name",
    title: input.jobTitle || null,
    company: input.company || business.name,
    phone: input.phone || null,
    email: input.email || null,
    website: input.website || null,
    address: input.address || null,
    tagline: input.tagline || null,
    photo: input.photoUrl,
    logo: business.logoUrl,
    qr: input.showQr ? qr : null,
  };
  return renderBusinessCard(content, { template: input.template as CardTemplate, primaryColor: input.primaryColor, secondaryColor: input.secondaryColor });
}

// ---------------------------------------------------------------------------
// Download, print, and send

function CardActions({ business, card }: { business: Business; card: BusinessCard }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState<"pdf" | "png" | "print" | null>(null);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [recipient, setRecipient] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const run = async (kind: "pdf" | "png" | "print") => {
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadCardPdf(business.id, card.id, `${card.name}-card.pdf`);
      else {
        // The server embeds the logo and photo so they survive being drawn to an image or printed.
        const { pages, fileBase } = await getCardPages(business.id, card.id);
        if (kind === "png") await savePagesAsPng(pages.map((page) => page), fileBase);
        else await printPages(pages);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!email.trim()) return toast.error("Enter the email address to send the card to");
    setSending(true);
    try {
      const updated = await sendCard(business.id, card.id, { email: email.trim(), recipientName: recipient.trim() || undefined, message: message.trim() || undefined });
      queryClient.setQueryData(cardKeys.detail(business.id, card.id), updated);
      toast.success(`Card sent to ${updated.lastSentTo}`);
      setSendOpen(false);
      setMessage("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The email couldn't be sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => void run("print")} loading={busy === "print"} disabled={busy !== null}>
        <Printer className="h-4 w-4" />
        Print
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" loading={busy === "pdf" || busy === "png"} disabled={busy !== null}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void run("pdf")}>
            <FileDown className="h-4 w-4" />
            As a PDF file (front and back)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run("png")}>
            <ImageDown className="h-4 w-4" />
            As images (one per side)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Mail className="h-4 w-4" />
            Send by email
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {card.name}&apos;s card</DialogTitle>
            <DialogDescription>It&apos;s sent as a PDF attachment in an email with {business.name}&apos;s name and logo.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="card-send-email">Recipient email</Label>
              <Input id="card-send-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="card-send-name">Recipient name (optional)</Label>
              <Input id="card-send-name" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Who is it for?" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="card-send-message">Message (optional)</Label>
              <Textarea id="card-send-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Leave empty for the standard message" />
            </div>
            {card.lastSentTo && <p className="text-xs text-muted-foreground">Last sent to {card.lastSentTo}.</p>}
          </div>
          <DialogFooter>
            <Button onClick={send} loading={sending}>
              <Mail className="h-4 w-4" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// List

export function CardsListPage() {
  const { business } = useBusinessOutletContext();
  usePageMeta({ title: `Business cards · ${business.name}` });
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const params = { page, pageSize: 12, search: search || undefined, dateFrom: range.dateFrom, dateTo: range.dateTo };
  const { data, isLoading } = useQuery({ queryKey: cardKeys.list(business.id, params), queryFn: () => listCards(business.id, params) });
  const base = `/admin/businesses/${business.id}/cards`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Business cards</h2>
          <p className="text-sm text-muted-foreground">Complimentary cards for {business.name}. Open one to print it, download it, or email it to a client.</p>
        </div>
        <LinkButton to={`${base}/new`} variant="default">
          <Plus className="h-4 w-4" />
          New card
        </LinkButton>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search name or title..."
            aria-label="Search cards"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <DateRangeFilter range={range} onChange={() => setPage(1)} label="Created" />
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
        <div className="ml-auto">
          <ExportButtons path={`/businesses/${business.id}/cards/export`} params={{ dateFrom: range.dateFrom, dateTo: range.dateTo }} fileLabel={`${business.name} business cards`} />
        </div>
      </div>

      {isLoading && <Loading label="Loading cards" />}
      {!isLoading && data?.items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <IdCard className="h-8 w-8 text-primary/50" aria-hidden="true" />
            No cards yet. Make one from {CARD_TEMPLATES.length} designs.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((card) => (
          <Link key={card.id} to={`${base}/${card.id}`} className="group flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-3 transition hover:border-primary/40 hover:shadow-glow">
            <CardThumb business={business} card={card} />
            <div className="min-w-0 px-1">
              <p className="truncate text-sm font-semibold">{card.name}</p>
              <p className="truncate text-xs text-muted-foreground">{card.jobTitle ?? card.company}</p>
            </div>
          </Link>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function CardThumb({ business, card }: { business: Business; card: BusinessCard }) {
  const svg = React.useMemo(() => previewPages(business, cardInputOf(card), qrFor(card.website))[0], [business, card]);
  return <DesignSvg svg={svg} label={`${card.name}'s card`} className="rounded-xl" />;
}

// ---------------------------------------------------------------------------
// Editor

function TemplateChoice({ business, input, id, active, onSelect }: { business: Business; input: CardInput; id: CardTemplate; active: boolean; onSelect: () => void }) {
  const info = cardTemplateInfo(id)!;
  const svg = React.useMemo(
    () => previewPages(business, { ...input, template: id, primaryColor: info.primary, secondaryColor: info.secondary }, null)[0],
    [business, input.name, input.jobTitle, input.company, input.phone, input.email, input.website, input.address, input.tagline, input.photoUrl, id, info.primary, info.secondary],
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn("flex flex-col gap-1.5 rounded-xl border-2 p-1.5 text-left text-xs font-medium transition", active ? "border-primary shadow-glow" : "border-border/70 hover:border-primary/40")}
    >
      <DesignSvg svg={svg} label={`${info.name} layout`} className="rounded-md" />
      <span className="px-0.5">
        <span className="block text-sm">{info.name}</span>
        <span className="block font-normal text-muted-foreground">{info.description}</span>
      </span>
    </button>
  );
}

function CardEditorPage({ mode }: { mode: "new" | "edit" }) {
  const { business } = useBusinessOutletContext();
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const base = `/admin/businesses/${business.id}/cards`;
  const { data: existing, isLoading } = useQuery({
    queryKey: cardKeys.detail(business.id, cardId ?? ""),
    queryFn: () => getCard(business.id, cardId!),
    enabled: mode === "edit" && !!cardId,
  });
  usePageMeta({ title: mode === "new" ? `New card · ${business.name}` : `${existing?.name ?? "Card"} · ${business.name}` });

  const [input, setInput] = React.useState<CardInput>(() => emptyCard(business));
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const canDelete = business.myRole === "admin";
  React.useEffect(() => {
    if (existing) setInput(cardInputOf(existing));
  }, [existing]);

  const set = (patch: Partial<CardInput>) => setInput((i) => ({ ...i, ...patch }));
  const text = (key: "name" | "jobTitle" | "company" | "phone" | "email" | "website" | "address" | "tagline") => ({
    id: `card-${key}`,
    value: (input[key] ?? "") as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: e.target.value }),
  });

  const qr = React.useMemo(() => qrFor(input.website), [input.website]);
  const [front, back] = React.useMemo(() => previewPages(business, input, qr), [business, input, qr]);
  const usesPhoto = cardTemplateInfo(input.template)?.usesPhoto ?? false;

  const pickTemplate = (id: CardTemplate) => {
    const info = cardTemplateInfo(id)!;
    set({ template: id, primaryColor: info.primary, secondaryColor: info.secondary });
  };

  const save = async () => {
    if (!input.name.trim()) return toast.error("Enter the person's name");
    if (!input.company.trim()) return toast.error("Enter the company name");
    setSaving(true);
    try {
      const body: CardInput = { ...input, name: input.name.trim(), company: input.company.trim() };
      if (mode === "new") {
        const created = await createCard(business.id, body);
        await queryClient.invalidateQueries({ queryKey: ["business-cards", business.id] });
        toast.success("Card saved");
        navigate(`${base}/${created.id}`, { replace: true });
      } else {
        const updated = await updateCard(business.id, cardId!, body);
        queryClient.setQueryData(cardKeys.detail(business.id, cardId!), updated);
        await queryClient.invalidateQueries({ queryKey: ["business-cards", business.id, "list"] });
        toast.success("Card updated");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save the card");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!cardId) return;
    setDeleting(true);
    try {
      await deleteCard(business.id, cardId);
      await queryClient.invalidateQueries({ queryKey: ["business-cards", business.id] });
      toast.success("Card deleted");
      navigate(base, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete the card");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (mode === "edit" && isLoading) return <Loading label="Loading card" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <LinkButton to={base} variant="ghost" size="sm" className="self-start px-0">
            <ArrowLeft className="h-4 w-4" />
            All cards
          </LinkButton>
          <h2 className="truncate text-lg font-semibold">{mode === "new" ? "New business card" : input.name || "Business card"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {existing && <CardActions business={business} card={existing} />}
          {mode === "edit" && canDelete && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)} aria-label="Delete card">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" />
            {mode === "new" ? "Save card" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
              <CardDescription>What appears on the card. Leave a line empty to leave it off.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-name">Full name</Label>
                <Input {...text("name")} placeholder="Enter the full name" autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-jobTitle">Job title</Label>
                <Input {...text("jobTitle")} placeholder="e.g. Managing Director" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-company">Company</Label>
                <Input {...text("company")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-tagline">Tagline</Label>
                <Input {...text("tagline")} placeholder="A short slogan" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-phone">Phone</Label>
                <Input {...text("phone")} inputMode="tel" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-email">Email</Label>
                <Input {...text("email")} type="email" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-website">Website</Label>
                <Input {...text("website")} placeholder="www.example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-address">Address</Label>
                <Input {...text("address")} />
              </div>
              {usesPhoto && (
                <div className="sm:col-span-2">
                  <ImagePickerField
                    label="Photo (this layout has room for one)"
                    hint="A square or portrait picture works best."
                    value={input.photoUrl ?? undefined}
                    uploading={uploading}
                    onUpload={async (file) => {
                      setUploading(true);
                      try {
                        set({ photoUrl: await uploadBusinessImage(business.id, file) });
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : "The photo couldn't be uploaded");
                      } finally {
                        setUploading(false);
                      }
                    }}
                    onRemove={() => set({ photoUrl: null })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Design</CardTitle>
              <CardDescription>Pick a layout, then change its colours. Your logo is added from the Overview tab.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CARD_TEMPLATES.map((t) => (
                  <TemplateChoice key={t.id} business={business} input={input} id={t.id} active={input.template === t.id} onSelect={() => pickTemplate(t.id)} />
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["primaryColor", "secondaryColor"] as const).map((key) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`card-${key}`}>{key === "primaryColor" ? "Main colour" : "Second colour"}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={key === "primaryColor" ? "Pick the main colour" : "Pick the second colour"}
                        value={input[key]}
                        onChange={(e) => set({ [key]: e.target.value })}
                        className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
                      />
                      <Input id={`card-${key}`} className="font-mono" value={input[key]} onChange={(e) => set({ [key]: e.target.value })} />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 sm:col-span-2">
                  <Label htmlFor="card-showQr" className="font-normal">
                    Add a QR code of the website
                    <span className="block text-xs text-muted-foreground">Shown on layouts that have room for one, when a website is entered.</span>
                  </Label>
                  <Switch id="card-showQr" checked={input.showQr} onCheckedChange={(v) => set({ showQr: v })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-20 xl:self-start">
          <p className="text-sm font-medium text-muted-foreground">Live preview</p>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Front</p>
            <DesignSvg svg={front} label="Front of the card" className="rounded-xl shadow-lg" />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Back</p>
            <DesignSvg svg={back} label="Back of the card" className="rounded-xl shadow-lg" />
          </div>
          {mode === "new" && <p className="text-xs text-muted-foreground">Save the card to print it, download it, or email it.</p>}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${input.name || "this card"}?`}
        description="The card is removed from your list. Copies you have already printed, downloaded or emailed are not affected."
        confirmLabel="Delete card"
        busy={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

export const NewCardPage = () => <CardEditorPage mode="new" />;
export const CardDetailPage = () => <CardEditorPage mode="edit" />;
