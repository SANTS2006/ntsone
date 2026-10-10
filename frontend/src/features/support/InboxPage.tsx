import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag, Inbox, Mail, MessageSquarePlus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getMessage, listMessages, updateMessageStatus, type MessageKind, type MessageStatus, type SupportMessage } from "./api";
import { usePageMeta } from "@/lib/seo";

const TABS: { kind: MessageKind; label: string; icon: typeof Inbox; description: string }[] = [
  { kind: "feedback", label: "Feedback", icon: MessageSquarePlus, description: "Improvements, bugs, and feature requests from admins and viewers." },
  { kind: "contact", label: "Contact messages", icon: Mail, description: "Messages sent through the website's contact form." },
  { kind: "report", label: "Reports", icon: Flag, description: "Concerns reported through the website's report form." },
];

const STATUS_LABELS: Record<MessageStatus, string> = { new: "New", read: "Read", resolved: "Resolved" };

function StatusBadge({ status }: { status: MessageStatus }) {
  return (
    <Badge variant={status === "new" ? "default" : status === "resolved" ? "success" : "secondary"}>{STATUS_LABELS[status]}</Badge>
  );
}

function sender(m: SupportMessage) {
  return m.userName ?? m.name ?? m.email ?? "Anonymous";
}

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Super admin inbox: feedback, contact messages, and reports, each opening to its full details. */
export function InboxPage() {
  usePageMeta({ title: "Inbox" });
  const queryClient = useQueryClient();
  const [kind, setKind] = React.useState<MessageKind>("feedback");
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const [openId, setOpenId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["inbox", kind, status, search, page, range.dateFrom, range.dateTo],
    queryFn: () =>
      listMessages({ kind, status: status === "all" ? undefined : (status as MessageStatus), search: search || undefined, page, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["inbox-message", openId],
    queryFn: () => getMessage(openId!),
    enabled: openId !== null,
  });

  // Opening a message marks it read on the server; refresh the counts and list.
  React.useEffect(() => {
    if (detail) void queryClient.invalidateQueries({ queryKey: ["inbox"] });
  }, [detail, queryClient]);

  const setMessageStatus = async (id: string, next: MessageStatus) => {
    try {
      await updateMessageStatus(id, next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["inbox-message", id] }),
      ]);
      toast.success(`Marked as ${STATUS_LABELS[next].toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update the message");
    }
  };

  const tab = TABS.find((t) => t.kind === kind)!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Inbox className="h-6 w-6 text-primary" aria-hidden="true" />
            Inbox
          </h1>
          <p className="text-sm text-muted-foreground">Everything people have sent to the platform team.</p>
        </div>
        <ExportButtons
          path="/platform/messages/export"
          params={{ kind, status: status === "all" ? undefined : status, search, dateFrom: range.dateFrom, dateTo: range.dateTo }}
          fileLabel={`Inbox ${kind}`}
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => {
              setKind(t.kind);
              setPage(1);
            }}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              kind === t.kind ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:bg-gradient-brand-soft hover:text-primary",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {(data?.newCounts[t.kind] ?? 0) > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs font-semibold",
                  kind === t.kind ? "bg-white/25 text-white" : "bg-primary text-primary-foreground",
                )}
              >
                {data?.newCounts[t.kind]}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tab.label}</CardTitle>
          <CardDescription>{tab.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <DateRangeFilter range={range} onChange={() => setPage(1)} label="Received" />
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name, email, text..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader className="bg-gradient-brand-soft">
                <TableRow className="hover:bg-transparent">
                  {["From", kind === "contact" ? "Subject" : "Type", kind === "report" ? "Details" : "Subject", "Status", "Received"].map(
                    (h, i) => (
                      <TableHead key={`${h}-${i}`} className="whitespace-nowrap font-semibold">
                        {h}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground"><Loading inline label="Loading" /></TableCell>
                  </TableRow>
                )}
                {!isLoading && (data?.items.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Nothing here yet.
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((m) => (
                  <TableRow
                    key={m.id}
                    className={cn("cursor-pointer", m.status === "new" && "font-medium")}
                    onClick={() => setOpenId(m.id)}
                  >
                    <TableCell>
                      <p className="font-medium">{sender(m)}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.organizationName ?? m.userEmail ?? m.email ?? ""}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {kind === "contact" ? (m.subject ?? "—") : (m.category ?? "—")}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="truncate text-sm">{kind === "report" ? m.message : (m.subject ?? m.message)}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{when(m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span>
                Page {data.page} of {data.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          {detailLoading || !detail ? (
            <Loading label="Loading" />
          ) : (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detail.subject ?? detail.category ?? "Message"}
                  <StatusBadge status={detail.status} />
                </DialogTitle>
                <DialogDescription>Received {when(detail.createdAt)}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border/70 p-4 text-sm">
                <dt className="text-muted-foreground">From</dt>
                <dd className="font-medium">{sender(detail)}</dd>
                {(detail.userEmail ?? detail.email) && (
                  <>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd>
                      <a href={`mailto:${detail.userEmail ?? detail.email}`} className="font-medium text-primary">
                        {detail.userEmail ?? detail.email}
                      </a>
                    </dd>
                  </>
                )}
                {detail.phone && (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium">{detail.phone}</dd>
                  </>
                )}
                {detail.category && (
                  <>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-medium">{detail.category}</dd>
                  </>
                )}
                {detail.organizationName && (
                  <>
                    <dt className="text-muted-foreground">Account</dt>
                    <dd className="font-medium">{detail.organizationName}</dd>
                  </>
                )}
                {detail.programName && (
                  <>
                    <dt className="text-muted-foreground">Program</dt>
                    <dd className="font-medium">{detail.programName}</dd>
                  </>
                )}
                {detail.link && (
                  <>
                    <dt className="text-muted-foreground">Link</dt>
                    <dd className="break-all font-medium">{detail.link}</dd>
                  </>
                )}
                {detail.ipAddress && (
                  <>
                    <dt className="text-muted-foreground">IP address</dt>
                    <dd className="font-mono text-xs">{detail.ipAddress}</dd>
                  </>
                )}
              </dl>
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">
                {detail.message}
              </div>
              <div className="flex flex-wrap gap-2">
                {(detail.userEmail ?? detail.email) && (
                  <a
                    href={`mailto:${detail.userEmail ?? detail.email}?subject=${encodeURIComponent(`Re: ${detail.subject ?? detail.category ?? "your message"}`)}`}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-brand px-4 text-sm font-medium text-white"
                  >
                    <Mail className="h-4 w-4" />
                    Reply by email
                  </a>
                )}
                {detail.status !== "resolved" ? (
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setMessageStatus(detail.id, "resolved")}>
                    Mark resolved
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setMessageStatus(detail.id, "read")}>
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
