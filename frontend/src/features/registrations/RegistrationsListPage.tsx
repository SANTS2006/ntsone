import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { useNavigate } from "react-router-dom";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/RefreshButton";
import { ImportRegistrationsDialog } from "./ImportRegistrationsDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RegistrationStatusBadge } from "@/components/StatusBadge";
import { formatMinor } from "@/lib/money";
import { PaymentBadge } from "../payments/PaymentBadge";
import { orderSummary } from "../payments/RegistrationPaymentCard";
import { ApiError } from "@/lib/api";
import { useProgramOutletContext } from "../programs/ProgramDetailLayout";
import { exportRegistrations } from "./api";
import { useRegistrationsList } from "./hooks";
import type { Registration, RegistrationStatus } from "@/types/api";

export function RegistrationsListPage() {
  const { program, submissionPath, terms } = useProgramOutletContext();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<string>("all");
  // The payment column and filter only appear for programs that take payments.
  const takesPayments = Boolean(program.paymentConfig?.enabled);
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const { dateFrom, dateTo } = range;
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "submittedAt", desc: true }]);
  const [exporting, setExporting] = React.useState<"csv" | "xlsx" | null>(null);

  const sort = sorting[0];
  const { data, isLoading } = useRegistrationsList(program.id, {
    page,
    pageSize: 20,
    search: search || undefined,
    status: status === "all" ? undefined : (status as RegistrationStatus),
    dateFrom,
    dateTo,
    paymentStatus: paymentFilter === "all" ? undefined : paymentFilter,
    sortBy: (sort?.id as "submittedAt" | "registrationNumber" | "status") ?? "submittedAt",
    sortDir: sort?.desc ? "desc" : "asc",
  });

  const columns = React.useMemo<ColumnDef<Registration>[]>(
    () => [
      { accessorKey: "registrationNumber", header: terms.numberLabel },
      { accessorKey: "applicantName", header: "Name", cell: (c) => c.getValue<string>() ?? "—" },
      { accessorKey: "applicantEmail", header: "Email", cell: (c) => c.getValue<string>() ?? "—" },
      // For order forms that sell items: what was ordered, right in the list.
      ...(program.kind === "order_form"
        ? [
            {
              id: "items",
              header: "Items ordered",
              enableSorting: false,
              cell: (c: { row: { original: Registration } }) => {
                const summary = orderSummary(c.row.original);
                if (!summary) return "—";
                return (
                  <span className="flex max-w-[18rem] flex-col" title={summary.text}>
                    <span className="truncate">{summary.text}</span>
                    <span className="text-xs text-muted-foreground">
                      {summary.count} {summary.count === 1 ? "item" : "items"} · {formatMinor(summary.totalMinor)}
                    </span>
                  </span>
                );
              },
            } as ColumnDef<Registration>,
          ]
        : []),
      {
        accessorKey: "status",
        header: "Status",
        cell: (c) => <RegistrationStatusBadge status={c.getValue<string>()} label={terms.statusLabel(c.getValue<RegistrationStatus>())} tone={terms.statusTone?.(c.getValue<RegistrationStatus>())} />,
      },
      ...(takesPayments
        ? [
            {
              id: "payment",
              header: "Payment",
              cell: (c: { row: { original: Registration } }) => (
                <span className="flex flex-col gap-0.5">
                  <PaymentBadge status={c.row.original.paymentStatus} />
                  {c.row.original.paymentStatus && c.row.original.paymentStatus !== "none" && (c.row.original.amountDueMinor ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground">{formatMinor(c.row.original.amountDueMinor ?? 0)}</span>
                  )}
                </span>
              ),
            } as ColumnDef<Registration>,
          ]
        : []),
      {
        accessorKey: "submittedAt",
        header: "Submitted",
        cell: (c) => new Date(c.getValue<string>()).toLocaleString(),
      },
    ],
    [takesPayments, program.kind],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      await exportRegistrations(program.id, program.name, {
        format,
        search: search || undefined,
        status: status === "all" ? undefined : (status as RegistrationStatus),
        dateFrom,
        dateTo,
        paymentStatus: paymentFilter === "all" ? undefined : paymentFilter,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to export ${terms.plural}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, #..."
            className="pl-9"
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
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {terms.statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {terms.statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {takesPayments && (
          <Select
            value={paymentFilter}
            onValueChange={(v) => {
              setPaymentFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label="Filter by payment">
              <SelectValue placeholder="All payments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="pending">Awaiting payment</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="review">Needs review</SelectItem>
              <SelectItem value="waived">Waived</SelectItem>
            </SelectContent>
          </Select>
        )}
        <DateRangeFilter range={range} onChange={() => setPage(1)} label="Submitted" />
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <RefreshButton />
          {program.myRole === "admin" && <ImportRegistrationsDialog programId={program.id} termLabel={terms.plural} />}
          <Button
            variant="outline"
            size="sm"
            loading={exporting === "csv"}
            disabled={exporting !== null}
            onClick={() => handleExport("csv")}
          >
            <FileText className="h-4 w-4" />
            {exporting === "csv" ? "Exporting..." : "Export CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={exporting === "xlsx"}
            disabled={exporting !== null}
            onClick={() => handleExport("xlsx")}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting === "xlsx" ? "Exporting..." : "Export Excel"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-gradient-brand-soft">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="cursor-pointer select-none font-semibold"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground"><Loading inline label="Loading" /></TableCell>
              </TableRow>
            )}
            {!isLoading && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  No {terms.plural} found.
                </TableCell>
              </TableRow>
            )}
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(submissionPath(row.original.id))}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
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
    </div>
  );
}
