import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, FileDown, ImageDown, ListChecks, Mail, Plus, Printer, Save, Search, Settings2, Trash2 } from "lucide-react";
import { DOCUMENT_WORDING, formatMoney } from "@designs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { printPages, savePagesAsPng } from "../designs/documentImage";
import {
  createDocument,
  deleteDocument,
  downloadDocumentPdf,
  getDocument,
  getDocumentPages,
  kindPath,
  listDocuments,
  sendDocument,
  updateDocument,
  type Business,
  type BusinessDocument,
  type DocumentKind,
} from "./api";
import { useBusinessOutletContext } from "./BusinessLayout";
import { DocumentEditor, draftFromDocument, emptyDraft, toInput, type DocumentDraft } from "./DocumentEditor";
import { statusLabel, statusTone } from "./statuses";

const label = (kind: DocumentKind) => DOCUMENT_WORDING[kind].noun;
const docKeys = {
  list: (businessId: string, kind: DocumentKind, params: object) => ["business-docs", businessId, kind, "list", params] as const,
  detail: (businessId: string, kind: DocumentKind, id: string) => ["business-docs", businessId, kind, "detail", id] as const,
};

function settingsFor(business: Business, kind: DocumentKind) {
  return kind === "invoice" ? business.invoiceSettings : kind === "receipt" ? business.receiptSettings : business.quotationSettings;
}

export function DocumentStatusBadge({ business, kind, status }: { business: Business; kind: DocumentKind; status: string }) {
  const defs = business.statusConfig[kind];
  return <Badge variant={statusTone(defs, status)}>{statusLabel(defs, status)}</Badge>;
}

// ---------------------------------------------------------------------------
// Download and send

export function DocumentActions({ business, doc, onSent }: { business: Business; doc: BusinessDocument; onSent?: (doc: BusinessDocument) => void }) {
  const [busy, setBusy] = React.useState<"pdf" | "png" | "print" | null>(null);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [email, setEmail] = React.useState(doc.clientEmail ?? "");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  React.useEffect(() => setEmail(doc.clientEmail ?? ""), [doc.clientEmail]);

  const download = async (format: "pdf" | "png" | "print") => {
    setBusy(format);
    try {
      if (format === "print") {
        // Printed from the same drawing as the downloads, at the real page size.
        const { pages } = await getDocumentPages(business.id, doc.kind, doc.id);
        await printPages(pages);
      } else if (format === "pdf") await downloadDocumentPdf(business.id, doc.kind, doc.id, `${doc.number}.pdf`);
      else {
        // Each page is saved as its own image when the items run over one page.
        const { pages, fileBase } = await getDocumentPages(business.id, doc.kind, doc.id);
        await savePagesAsPng(pages, fileBase);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The download didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!email.trim()) return toast.error("Enter the email address to send it to");
    setSending(true);
    try {
      const updated = await sendDocument(business.id, doc.kind, doc.id, { email: email.trim(), message: message.trim() || undefined });
      toast.success(`${label(doc.kind)} ${doc.number} sent to ${updated.lastSentTo}`);
      setSendOpen(false);
      setMessage("");
      onSent?.(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The email couldn't be sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => void download("print")} loading={busy === "print"} disabled={busy !== null}>
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
          <DropdownMenuItem onSelect={() => void download("pdf")}>
            <FileDown className="h-4 w-4" />
            As a PDF file
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void download("png")}>
            <ImageDown className="h-4 w-4" />
            As images (one per page)
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
            <DialogTitle>
              Send {label(doc.kind).toLowerCase()} {doc.number}
            </DialogTitle>
            <DialogDescription>
              It&apos;s sent as a PDF attachment in an email with {business.name}&apos;s name and logo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-email">Recipient email</Label>
              <Input id="send-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
              {!doc.clientEmail && <p className="text-xs text-muted-foreground">This {label(doc.kind).toLowerCase()} has no client email, so enter one here.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-message">Message (optional)</Label>
              <Textarea id="send-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Leave empty for the standard message" />
            </div>
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

function DocumentsListPage({ kind }: { kind: DocumentKind }) {
  const { business } = useBusinessOutletContext();
  usePageMeta({ title: `${label(kind)}s · ${business.name}` });
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const params = { page, pageSize: 20, search: search || undefined, status: status === "all" ? undefined : status, dateFrom: range.dateFrom, dateTo: range.dateTo };
  const { data, isLoading } = useQuery({
    queryKey: docKeys.list(business.id, kind, params),
    queryFn: () => listDocuments(business.id, kind, params),
  });
  const statuses = business.statusConfig[kind];
  const base = `/admin/businesses/${business.id}/${kindPath(kind)}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{label(kind)}s</h2>
          <p className="text-sm text-muted-foreground">
            Every {label(kind).toLowerCase()} saved for {business.name}. Open one to edit, download, or email it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {business.myRole === "admin" && (
            <LinkButton to={`${base}/settings`} variant="outline">
              <Settings2 className="h-4 w-4" />
              {label(kind)} design
            </LinkButton>
          )}
          <LinkButton to={`${base}/new`} variant="default">
            <Plus className="h-4 w-4" />
            New {label(kind).toLowerCase()}
          </LinkButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search number or client..."
            aria-label={`Search ${label(kind).toLowerCase()}s`}
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <DateRangeFilter range={range} onChange={() => setPage(1)} label="Issued" />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
        <div className="ml-auto">
          <ExportButtons
            path={`/businesses/${business.id}/${kindPath(kind)}/export`}
            params={{ search, status: status === "all" ? undefined : status, dateFrom: range.dateFrom, dateTo: range.dateTo }}
            fileLabel={`${business.name} ${label(kind).toLowerCase()}s`}
          />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Number</th>
                <th scope="col" className="px-4 py-3 font-medium">Client</th>
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-2">
                    <Loading inline label="Loading" />
                  </td>
                </tr>
              )}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No {label(kind).toLowerCase()}s yet.{" "}
                    <Link to={`${base}/new`} className="font-medium text-primary hover:underline">
                      Create the first one
                    </Link>
                  </td>
                </tr>
              )}
              {data?.items.map((doc) => (
                <tr
                  key={doc.id}
                  className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40"
                  onClick={() => navigate(`${base}/${doc.id}`)}
                >
                  <td className="px-4 py-3 font-medium">
                    <Link to={`${base}/${doc.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                      {doc.number}
                    </Link>
                    {doc.updated && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Updated
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{doc.clientName}</div>
                    {doc.clientEmail && <div className="text-xs text-muted-foreground">{doc.clientEmail}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{new Date(doc.issueDate).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(doc.total, doc.currency)}</td>
                  <td className="px-4 py-3">
                    <DocumentStatusBadge business={business} kind={kind} status={doc.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

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

// ---------------------------------------------------------------------------
// Live page: create, then clear the form and stay for the next one

function LiveDocumentPage({ kind }: { kind: DocumentKind }) {
  const { business } = useBusinessOutletContext();
  usePageMeta({ title: `New ${label(kind).toLowerCase()} · ${business.name}` });
  const settings = settingsFor(business, kind);
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<DocumentDraft>(() => emptyDraft(kind, settings, business.statusConfig[kind][0]?.key));
  const [saving, setSaving] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<BusinessDocument | null>(null);
  const base = `/admin/businesses/${business.id}/${kindPath(kind)}`;

  const save = async () => {
    const { input, error } = toInput(draft);
    if (!input) return toast.error(error);
    setSaving(true);
    try {
      const doc = await createDocument(business.id, kind, input);
      await queryClient.invalidateQueries({ queryKey: ["business-docs", business.id, kind] });
      setLastSaved(doc);
      setDraft(emptyDraft(kind, settings, business.statusConfig[kind][0]?.key));
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(`${label(kind)} ${doc.number} saved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to save the ${label(kind).toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">New {label(kind).toLowerCase()}</h2>
          <p className="text-sm text-muted-foreground">Fill it in and save. The form clears so you can start the next one straight away.</p>
        </div>
        <LinkButton to={base} variant="outline">
          <ListChecks className="h-4 w-4" />
          All {label(kind).toLowerCase()}s
        </LinkButton>
      </div>

      {lastSaved && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="font-semibold">
                {label(kind)} {lastSaved.number}
              </span>{" "}
              for {lastSaved.clientName} was saved. Download or send it now, or open it later from the list.
            </p>
            <div className="flex flex-wrap gap-2">
              <DocumentActions business={business} doc={lastSaved} onSent={setLastSaved} />
              <LinkButton to={`${base}/${lastSaved.id}`} variant="ghost">
                Open
              </LinkButton>
            </div>
          </CardContent>
        </Card>
      )}

      <DocumentEditor
        kind={kind}
        business={business}
        settings={settings}
        draft={draft}
        onChange={setDraft}
        number={`${settings.prefix.toUpperCase()}-NEW`}
        actions={
          <>
            <Button onClick={save} loading={saving}>
              <Save className="h-4 w-4" />
              Save {label(kind).toLowerCase()}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(emptyDraft(kind, settings, business.statusConfig[kind][0]?.key))} disabled={saving}>
              Clear
            </Button>
          </>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail: preview, edit (marked as updated), download, send

function DocumentDetailPage({ kind }: { kind: DocumentKind }) {
  const { business } = useBusinessOutletContext();
  const { documentId = "" } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = settingsFor(business, kind);
  const base = `/admin/businesses/${business.id}/${kindPath(kind)}`;
  const { data: doc, isLoading, error } = useQuery({
    queryKey: docKeys.detail(business.id, kind, documentId),
    queryFn: () => getDocument(business.id, kind, documentId),
  });
  usePageMeta({ title: doc ? `${doc.number} · ${business.name}` : label(kind) });
  const [draft, setDraft] = React.useState<DocumentDraft | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (doc && !dirty) setDraft(draftFromDocument(doc));
  }, [doc, dirty]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{error instanceof ApiError ? error.message : `${label(kind)} not found`}</p>
        <LinkButton to={base} variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4" />
          All {label(kind).toLowerCase()}s
        </LinkButton>
      </div>
    );
  }
  if (isLoading || !doc || !draft) return <Loading label="Loading" />;

  const refresh = (updated: BusinessDocument) => {
    queryClient.setQueryData(docKeys.detail(business.id, kind, documentId), updated);
    void queryClient.invalidateQueries({ queryKey: ["business-docs", business.id, kind, "list"] });
  };

  const save = async () => {
    const { input, error: problem } = toInput(draft);
    if (!input) return toast.error(problem);
    setSaving(true);
    try {
      const updated = await updateDocument(business.id, kind, doc.id, input);
      setDirty(false);
      refresh(updated);
      toast.success(`${label(kind)} ${doc.number} updated`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save the changes");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteDocument(business.id, kind, doc.id);
      await queryClient.invalidateQueries({ queryKey: ["business-docs", business.id, kind] });
      toast.success(`${label(kind)} deleted`);
      navigate(base);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <LinkButton to={base} variant="ghost" size="sm" className="self-start px-0">
            <ArrowLeft className="h-4 w-4" />
            All {label(kind).toLowerCase()}s
          </LinkButton>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">
              {label(kind)} {doc.number}
            </h2>
            <DocumentStatusBadge business={business} kind={kind} status={doc.status} />
            {doc.updated && <Badge variant="warning">Updated {doc.editedAt ? new Date(doc.editedAt).toLocaleDateString() : ""}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {doc.clientName} · {formatMoney(doc.total, doc.currency)}
            {doc.sentAt && ` · Last sent to ${doc.lastSentTo} on ${new Date(doc.sentAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DocumentActions business={business} doc={doc} onSent={refresh} />
          {business.myRole === "admin" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" aria-label={`Delete ${label(kind).toLowerCase()} ${doc.number}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    Delete {label(kind).toLowerCase()} {doc.number}?
                  </DialogTitle>
                  <DialogDescription>It will no longer appear in the list or the analysis.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="destructive" onClick={remove}>
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {dirty && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          You have unsaved changes. Saving marks this {label(kind).toLowerCase()} as updated. Download and email use the last saved version.
        </p>
      )}

      <DocumentEditor
        kind={kind}
        business={business}
        settings={settings}
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setDirty(true);
        }}
        number={doc.number}
        updatedOn={dirty ? new Date().toISOString() : doc.editedAt}
        actions={
          <>
            <Button onClick={save} loading={saving} disabled={!dirty}>
              <Save className="h-4 w-4" />
              Save changes
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDirty(false);
                  setDraft(draftFromDocument(doc));
                }}
              >
                Discard changes
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}

export const QuotationsPage = () => <DocumentsListPage kind="quotation" />;
export const NewQuotationPage = () => <LiveDocumentPage kind="quotation" />;
export const QuotationDetailPage = () => <DocumentDetailPage kind="quotation" />;
export const InvoicesPage = () => <DocumentsListPage kind="invoice" />;
export const ReceiptsPage = () => <DocumentsListPage kind="receipt" />;
export const NewInvoicePage = () => <LiveDocumentPage kind="invoice" />;
export const NewReceiptPage = () => <LiveDocumentPage kind="receipt" />;
export const InvoiceDetailPage = () => <DocumentDetailPage kind="invoice" />;
export const ReceiptDetailPage = () => <DocumentDetailPage kind="receipt" />;
