import { Loading } from "@/components/Loading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { entriesExportPath, listEntries } from "./api";
import { useBooks } from "./BookkeepingLayout";
import { EntryDetailDialog } from "./EntryDetailDialog";
import { EntryDialog, type EntryDialogState } from "./EntryDialog";
import { dayLabel, KINDS, methodLabel, QUICK_KINDS } from "./kinds";

/** Every entry in the book, newest first, with filters, a date range and a download. */
export function LedgerPage() {
  const { businessId, currency, canEdit } = useBooks();
  const range = useDateRange();
  const [kind, setKind] = React.useState("all");
  const [status, setStatus] = React.useState<"active" | "voided" | "all">("active");
  const [unpaid, setUnpaid] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [entryDialog, setEntryDialog] = React.useState<EntryDialogState | null>(null);
  const [picking, setPicking] = React.useState(false);

  const filters = {
    from: range.fromDay || undefined,
    to: range.toDay || undefined,
    kind: kind === "all" ? undefined : kind,
    status,
    unpaid: unpaid ? ("true" as const) : undefined,
    search: search || undefined,
  };
  const { data, isLoading } = useQuery({
    queryKey: ["books", businessId, "entries", filters, page],
    queryFn: () => listEntries(businessId, { ...filters, page, pageSize: 25 }),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
  const reset = () => setPage(1);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Money in (this filter)</p>
            <p className="text-2xl font-bold text-emerald-600">{formatMinor(data?.summary.moneyInMinor ?? 0, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Money out (this filter)</p>
            <p className="text-2xl font-bold">{formatMinor(data?.summary.moneyOutMinor ?? 0, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Entries</p>
            <p className="text-2xl font-bold">{(data?.total ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search the book"
            placeholder="Search who, what, kind..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              reset();
            }}
          />
        </div>
        <DateRangeFilter range={range} onChange={reset} label="Entry" />
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v);
            reset();
          }}
        >
          <SelectTrigger className="w-48" aria-label="Kind of entry">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            {Object.values(KINDS).map((k) => (
              <SelectItem key={k.kind} value={k.kind}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            reset();
          }}
        >
          <SelectTrigger className="w-40" aria-label="Voided entries">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Counting</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
            <SelectItem value="all">Both</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unpaid}
            onChange={(e) => {
              setUnpaid(e.target.checked);
              reset();
            }}
            className="h-4 w-4"
          />
          Not fully paid
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ExportButtons path={entriesExportPath(businessId)} params={filters} fileLabel="Cash book" />
          {canEdit && (
            <Button onClick={() => setPicking((p) => !p)}>
              <Plus className="h-4 w-4" />
              Write something down
            </Button>
          )}
        </div>
      </div>

      {picking && canEdit && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card/70 p-3">
          {[...QUICK_KINDS].map((k) => {
            const info = KINDS[k];
            return (
              <button key={k} type="button" onClick={() => { setPicking(false); setEntryDialog({ kind: k }); }} className={cn("flex items-center gap-2 rounded-full bg-gradient-to-br px-4 py-2 text-sm font-semibold text-white shadow", info.tone)}>
                <info.icon className="h-4 w-4" />
                {info.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader className="bg-gradient-brand-soft">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>With</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Not paid yet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground"><Loading inline label="Loading your book" /></TableCell>
                </TableRow>
              )}
              {!isLoading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nothing matches. {canEdit ? "Press “Write something down” to add an entry." : ""}
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((entry) => {
                const info = KINDS[entry.kind];
                return (
                  <TableRow key={entry.id} className={cn("cursor-pointer", entry.voided && "opacity-60")} onClick={() => setDetailId(entry.id)}>
                    <TableCell>{dayLabel(entry.entryDate)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-white", info.tone)}>
                          <info.icon className="h-3.5 w-3.5" />
                        </span>
                        {info.label}
                        {entry.voided && <Badge variant="secondary">Voided</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate">{entry.description ?? entry.category ?? "—"}</TableCell>
                    <TableCell>{entry.partyName ?? "—"}</TableCell>
                    <TableCell>{methodLabel(entry.paymentMethod)}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", entry.moneyIn ? "text-emerald-600" : "")}>
                      {entry.moneyIn ? "+" : "-"}
                      {formatMinor(entry.amountMinor, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{entry.outstandingMinor > 0 ? <span className="font-medium text-amber-600">{formatMinor(entry.outstandingMinor, currency)}</span> : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
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

      <EntryDetailDialog businessId={businessId} currency={currency} entryId={detailId} canEdit={canEdit} onClose={() => setDetailId(null)} onEdit={(entry) => { setDetailId(null); setEntryDialog({ kind: entry.kind, entry }); }} />
      <EntryDialog businessId={businessId} currency={currency} state={entryDialog} onClose={() => setEntryDialog(null)} />
    </div>
  );
}
