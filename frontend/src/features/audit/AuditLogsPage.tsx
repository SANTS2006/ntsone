import { Loading } from "@/components/Loading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, Globe2, History, Search, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getAuditEntry, listAuditAccounts, listAuditLogs, type AuditAccount, type AuditRow, type Outcome } from "./api";

const OUTCOME: Record<Outcome, { label: string; className: string }> = {
  success: { label: "Done", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
  denied: { label: "Refused", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};

const ENTITY_LABEL: Record<string, string> = {
  program: "Program",
  form: "Form",
  registration: "Registration / order",
  poll: "Poll",
  business: "Business",
  document: "Invoice / receipt / quotation",
  card: "Business card",
  user: "Team member",
  tenant: "Account",
  payment: "Payment",
  payout: "Withdrawal",
  payout_account: "Withdrawal account",
  message: "Inbox message",
  system: "System",
};
const entityName = (type: string) => ENTITY_LABEL[type] ?? type.replace(/_/g, " ");

const ROLE_LABEL: Record<string, string> = { super_admin: "Platform admin", admin: "Admin", program_admin: "Program admin", viewer: "Viewer" };

const when = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

function Who({ row }: { row: AuditRow }) {
  const kind = { user: "", visitor: "Visitor", voter: "Voter", system: "System" }[row.actorType];
  const name = row.actorName ?? (kind || "Unknown");
  const detail = row.actorEmail ?? (row.actorRole ? ROLE_LABEL[row.actorRole] : null);
  return (
    <span className="flex flex-col">
      <span className="font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">
        {row.actorType === "user" ? [row.actorRole ? ROLE_LABEL[row.actorRole] : null, row.actorEmail].filter(Boolean).join(" · ") : [kind && name !== kind ? kind : null, detail].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

function AccountButton({ account, active, onClick }: { account: AuditAccount | { name: string; total: number; problems: number; lastActivityAt: string | null; tenantId: string | null | "all" }; active: boolean; onClick: () => void }) {
  const noAccount = account.tenantId === null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        active ? "border-primary/50 bg-gradient-brand-soft" : "border-transparent hover:bg-muted/60",
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand-soft text-primary">
        {account.tenantId === "all" ? <History className="h-4 w-4" /> : noAccount ? <Globe2 className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{account.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {account.total.toLocaleString()} {account.total === 1 ? "event" : "events"}
          {account.lastActivityAt ? ` · last ${new Date(account.lastActivityAt).toLocaleDateString()}` : ""}
        </span>
      </span>
      {account.problems > 0 && (
        <Badge variant="secondary" className="shrink-0 bg-destructive/15 text-destructive" title="Failed or refused attempts">
          {account.problems.toLocaleString()}
        </Badge>
      )}
    </button>
  );
}

function EntryDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["audit", "entry", id], queryFn: () => getAuditEntry(id!), enabled: Boolean(id) });
  const rows: [string, React.ReactNode][] = data
    ? [
        ["When", when(data.createdAt)],
        ["Account", data.tenantName ?? (data.tenantId ? "Deleted account" : "No account")],
        ["Who", [data.actorName ?? data.actorType, data.actorEmail, data.actorRole ? ROLE_LABEL[data.actorRole] : null].filter(Boolean).join(" · ")],
        ["What happened", data.label ?? data.action],
        ["Action code", <code key="a">{data.action}</code>],
        ["On", `${entityName(data.entityType)}${data.entityId ? ` · ${data.entityId}` : ""}`],
        ["Result", `${OUTCOME[data.outcome].label}${data.statusCode ? ` (status ${data.statusCode})` : ""}`],
        ["Address", data.ipAddress ?? "—"],
        ["Route", data.method && data.path ? <code key="r">{`${data.method} ${data.path}`}</code> : "—"],
        ["Request id", data.requestId ? <code key="q">{data.requestId}</code> : "—"],
        ["Browser", data.userAgent ?? "—"],
        ["Recorded as", data.source === "event" ? "A named event" : "A request"],
      ]
    : [];
  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{data?.label ?? "Audit entry"}</DialogTitle>
          <DialogDescription>This record can't be changed or removed.</DialogDescription>
        </DialogHeader>
        {isLoading && <Loading label="Loading" />}
        {data && (
          <div className="flex min-w-0 flex-col gap-4">
            <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-y-2">
              {rows.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="pt-2 text-xs text-muted-foreground sm:pt-0 sm:text-sm">{label}</dt>
                  <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{value}</dd>
                </React.Fragment>
              ))}
            </dl>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details kept with it</p>
              <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-muted/40 p-3 text-xs">{data.metadata ? JSON.stringify(data.metadata, null, 2) : "Nothing else was kept."}</pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One log entry as a card, for small screens where a wide table cannot fit. Tapping it opens the full record. */
function AuditCard({ row, showAccount, onOpen }: { row: AuditRow; showAccount: boolean; onOpen: () => void }) {
  const account = row.tenantName ?? (row.tenantId ? "Deleted account" : "No account");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-card/70 p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-gradient-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className={cn("shrink-0", OUTCOME[row.outcome].className)}>
            {OUTCOME[row.outcome].label}
          </Badge>
          <time dateTime={row.createdAt} className="min-w-0 truncate text-xs text-muted-foreground">
            {when(row.createdAt)}
          </time>
        </span>
        <span className="break-words text-sm font-medium leading-snug">{row.label ?? row.action}</span>
        <span className="grid gap-1.5 text-xs">
          <span className="flex min-w-0 gap-2">
            <span className="w-14 shrink-0 text-muted-foreground">Who</span>
            <span className="min-w-0 break-words">
              <Who row={row} />
            </span>
          </span>
          <span className="flex min-w-0 gap-2">
            <span className="w-14 shrink-0 text-muted-foreground">On</span>
            <span className="min-w-0 break-words">
              {entityName(row.entityType)}
              {(row.registrationNumber ?? row.entityId) && <span className="block break-all text-muted-foreground">{row.registrationNumber ?? row.entityId}</span>}
            </span>
          </span>
          {showAccount && (
            <span className="flex min-w-0 gap-2">
              <span className="w-14 shrink-0 text-muted-foreground">Account</span>
              <span className="min-w-0 break-words">{account}</span>
            </span>
          )}
          {row.ipAddress && (
            <span className="flex min-w-0 gap-2">
              <span className="w-14 shrink-0 text-muted-foreground">Address</span>
              <span className="min-w-0 break-all text-muted-foreground">{row.ipAddress}</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Everything that happens in the system, by account. For the platform's super admin only. */
export function AuditLogsPage() {
  usePageMeta({ title: "Audit log" });
  const range = useDateRange();
  const [tenant, setTenant] = React.useState<string>("all");
  const [accountSearch, setAccountSearch] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [outcome, setOutcome] = React.useState("all");
  const [actorType, setActorType] = React.useState("all");
  const [entityType, setEntityType] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  // On small screens the account list folds away behind a button so the log itself is what you see first.
  const [accountsOpen, setAccountsOpen] = React.useState(false);

  const accounts = useQuery({
    queryKey: ["audit", "accounts", range.dateFrom, range.dateTo, accountSearch],
    queryFn: () => listAuditAccounts({ dateFrom: range.dateFrom, dateTo: range.dateTo, search: accountSearch || undefined }),
    refetchInterval: 30_000,
  });

  const filters = {
    tenantId: tenant === "all" ? undefined : tenant,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    search: search || undefined,
    outcome: outcome === "all" ? undefined : outcome,
    actorType: actorType === "all" ? undefined : actorType,
    entityType: entityType === "all" ? undefined : entityType,
  };
  const { data, isLoading } = useQuery({
    queryKey: ["audit", "list", filters, page],
    queryFn: () => listAuditLogs({ ...filters, page, pageSize: 50 }),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });

  const reset = () => setPage(1);
  const totalAll = (accounts.data ?? []).reduce((sum, a) => sum + a.total, 0);
  const problemsAll = (accounts.data ?? []).reduce((sum, a) => sum + a.problems, 0);
  const selectedName = tenant === "all" ? "All accounts" : tenant === "none" ? "No account" : (accounts.data?.find((a) => a.tenantId === tenant)?.name ?? "This account");

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <ShieldAlert className="h-6 w-6 text-primary" />
          Audit log
        </h1>
        <p className="text-sm text-muted-foreground">
          Every action in the system, grouped by account: who did it, what they did, when, from where, and whether it worked. Visitors on the live registration and order pages are included. Records can't be changed or removed.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="min-w-0 lg:sticky lg:top-4">
          <CardContent className="flex flex-col gap-3 p-3">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 text-left lg:hidden"
              aria-expanded={accountsOpen}
              aria-controls="audit-accounts"
              onClick={() => setAccountsOpen((v) => !v)}
            >
              <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">Account</span>
                <span className="block truncate text-sm font-medium">{selectedName}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", accountsOpen && "rotate-180")} aria-hidden="true" />
            </button>
            <div id="audit-accounts" className={cn("flex-col gap-3", accountsOpen ? "flex" : "hidden lg:flex")}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Find an account" placeholder="Find an account..." className="pl-9" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} />
            </div>
            <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto lg:max-h-[60vh]">
              <AccountButton
                account={{ name: "All accounts", total: totalAll, problems: problemsAll, lastActivityAt: null, tenantId: "all" }}
                active={tenant === "all"}
                onClick={() => {
                  setTenant("all");
                  setAccountsOpen(false);
                  reset();
                }}
              />
              {accounts.isLoading && <Loading label="Loading accounts" />}
              {accounts.data?.map((account) => (
                <AccountButton
                  key={account.tenantId ?? "none"}
                  account={account}
                  active={tenant === (account.tenantId ?? "none")}
                  onClick={() => {
                    setTenant(account.tenantId ?? "none");
                    setAccountsOpen(false);
                    reset();
                  }}
                />
              ))}
              {accounts.data?.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No activity yet.</p>}
            </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto min-w-0 break-words text-lg font-semibold">{selectedName}</h2>
            <ExportButtons path="/audit-logs/export" params={filters} fileLabel={`Audit log - ${selectedName}`} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <div className="relative col-span-2 min-w-0 sm:min-w-52 sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search the log"
                placeholder="Search who, what, email, number, address..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  reset();
                }}
              />
            </div>
            <div className="col-span-2 min-w-0">
              <DateRangeFilter range={range} onChange={reset} label="Date" />
            </div>
            <Select
              value={outcome}
              onValueChange={(v) => {
                setOutcome(v);
                reset();
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Result">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any result</SelectItem>
                <SelectItem value="success">Done</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="denied">Refused</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={actorType}
              onValueChange={(v) => {
                setActorType(v);
                reset();
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Who">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="user">Signed-in staff</SelectItem>
                <SelectItem value="visitor">Visitors</SelectItem>
                <SelectItem value="voter">Voters</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={entityType}
              onValueChange={(v) => {
                setEntityType(v);
                reset();
              }}
            >
              <SelectTrigger className="col-span-2 w-full sm:col-span-1 sm:w-48" aria-label="What it was about">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anything</SelectItem>
                {Object.entries(ENTITY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Small screens: one card per entry. */}
          <div className="md:hidden">
            {isLoading ? (
              <Loading label="Loading the log" />
            ) : data?.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data?.items.map((row) => (
                  <AuditCard key={row.id} row={row} showAccount={tenant === "all"} onOpen={() => setOpenId(row.id)} />
                ))}
              </ul>
            )}
          </div>

          {/* Larger screens: the table. */}
          <div className="hidden overflow-x-auto rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm md:block">
            <Table className="whitespace-nowrap">
              <TableHeader className="bg-gradient-brand-soft">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Time</TableHead>
                  {tenant === "all" && <TableHead>Account</TableHead>}
                  <TableHead>Who</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead>On</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground"><Loading inline label="Loading the log" /></TableCell>
                  </TableRow>
                )}
                {!isLoading && data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nothing matches these filters.
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}>
                    <TableCell className="text-sm">{when(row.createdAt)}</TableCell>
                    {tenant === "all" && <TableCell className="text-sm">{row.tenantName ?? (row.tenantId ? "Deleted account" : <span className="text-muted-foreground">No account</span>)}</TableCell>}
                    <TableCell className="text-sm">
                      <Who row={row} />
                    </TableCell>
                    <TableCell className="max-w-[26rem] truncate text-sm" title={row.label ?? row.action}>
                      {row.label ?? row.action}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex flex-col">
                        <span>{entityName(row.entityType)}</span>
                        <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{row.registrationNumber ?? row.entityId ?? ""}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={OUTCOME[row.outcome].className}>
                        {OUTCOME[row.outcome].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.ipAddress ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="grid grid-cols-2 items-center gap-2 text-sm sm:flex sm:justify-between">
              <Button variant="outline" size="sm" className="sm:order-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="order-last col-span-2 text-center text-muted-foreground sm:order-2 sm:col-span-1">
                Page {data.page} of {data.totalPages.toLocaleString()} · {data.total.toLocaleString()} entries
              </span>
              <Button variant="outline" size="sm" className="sm:order-3" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
      <EntryDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
