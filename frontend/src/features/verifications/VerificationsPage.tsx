import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { useNavigate } from "react-router-dom";
import { Barcode, CalendarCheck, CreditCard, QrCode, ScanLine, Search, ShieldAlert, Ticket, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RegistrationStatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { useProgramOutletContext } from "../programs/ProgramDetailLayout";
import { DOCUMENT_LABELS, useVerifications, type Verification, type VerificationDocument } from "./api";
import { QrScannerDialog, type ScanMode } from "./QrScannerDialog";

export function DocumentBadge({ type }: { type: VerificationDocument }) {
  const Icon = type === "ticket" ? Ticket : type === "id_card" ? CreditCard : QrCode;
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" />
      {DOCUMENT_LABELS[type]}
    </Badge>
  );
}

export function ResultBadge({ valid }: { valid: boolean }) {
  return <Badge variant={valid ? "success" : "destructive"}>{valid ? "Valid" : "Not valid"}</Badge>;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function VerificationsPage() {
  const { program } = useProgramOutletContext();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [documentType, setDocumentType] = React.useState("all");
  const [result, setResult] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const [scanner, setScanner] = React.useState<ScanMode | null>(null);

  const { data, isLoading } = useVerifications(program.id, {
    page,
    pageSize: 20,
    search: search || undefined,
    documentType: documentType === "all" ? undefined : (documentType as VerificationDocument),
    result: result === "all" ? undefined : (result as "valid" | "invalid"),
    dateFrom: range.dateFrom, dateTo: range.dateTo,
  });

  const summary = data?.summary;
  const documentsOn = program.idCardEnabled || program.ticketEnabled;
  const columns = ["Registration #", "Name", "Document", "Result", "Status when scanned", "Scanned by", "Scanned at"];

  const openRegistration = (row: Verification) =>
    navigate(`/admin/programs/${program.id}/registrations/${row.registrationId}`);

  return (
    <div className="flex flex-col gap-5">
      {!documentsOn && (
        <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground">
          Turn on ID cards or tickets in the Overview tab. Every time someone scans a QR code on them, the check appears
          here.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total scans" value={summary?.total ?? 0} icon={ScanLine} />
        <StatCard label="People verified" value={summary?.registrationsVerified ?? 0} icon={UserCheck} />
        <StatCard label="Scans today" value={summary?.today ?? 0} icon={CalendarCheck} />
        <StatCard label="ID cards / tickets" value={`${summary?.idCards ?? 0} / ${summary?.tickets ?? 0}`} icon={CreditCard} />
        <StatCard label="Not valid" value={summary?.invalid ?? 0} icon={ShieldAlert} className="col-span-2 lg:col-span-1" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, #..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <DateRangeFilter range={range} onChange={() => setPage(1)} label="Scanned" />
        <Select
          value={documentType}
          onValueChange={(v) => {
            setDocumentType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All documents</SelectItem>
            <SelectItem value="id_card">ID cards</SelectItem>
            <SelectItem value="ticket">Tickets</SelectItem>
            <SelectItem value="link">Verification links</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={result}
          onValueChange={(v) => {
            setResult(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All results</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="invalid">Not valid</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} scans</span>
        <ExportButtons
          path={`/programs/${program.id}/verifications/export`}
          params={{
            search,
            documentType: documentType === "all" ? undefined : documentType,
            result: result === "all" ? undefined : result,
            dateFrom: range.dateFrom, dateTo: range.dateTo,
          }}
          fileLabel={`${program.name} verifications`}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => setScanner("qr")}>
            <ScanLine className="h-4 w-4" />
            Scan QR code
          </Button>
          <Button variant="outline" onClick={() => setScanner("barcode")}>
            <Barcode className="h-4 w-4" />
            Scan barcode
          </Button>
        </div>
      </div>

      <QrScannerDialog
        open={scanner !== null}
        onOpenChange={(open) => !open && setScanner(null)}
        programId={program.id}
        programSlug={program.slug}
        mode={scanner ?? "qr"}
      />

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-gradient-brand-soft">
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c} className="whitespace-nowrap font-semibold">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground"><Loading inline label="Loading" /></TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  No scans yet. When someone scans the QR code on an ID card or ticket, it shows up here.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => openRegistration(row)}>
                <TableCell className="whitespace-nowrap font-medium">{row.registrationNumber}</TableCell>
                <TableCell>
                  <p className="font-medium">{row.applicantName ?? "—"}</p>
                  {row.applicantEmail && <p className="text-xs text-muted-foreground">{row.applicantEmail}</p>}
                </TableCell>
                <TableCell>
                  <DocumentBadge type={row.documentType} />
                </TableCell>
                <TableCell>
                  <ResultBadge valid={row.valid} />
                </TableCell>
                <TableCell>
                  <RegistrationStatusBadge status={row.registrationStatus} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {row.verifiedByName ?? <span className="text-muted-foreground">Public scan</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{formatWhen(row.createdAt)}</TableCell>
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

/** A registration's own scan history, shown on its detail page. */
export function RegistrationVerifications({ programId, registrationId }: { programId: string; registrationId: string }) {
  const { data, isLoading } = useVerifications(programId, { registrationId, pageSize: 10 });
  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-2">
      {isLoading && <Loading label="Loading" />}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">This registration&apos;s ID card or ticket hasn&apos;t been scanned yet.</p>
      )}
      {items.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <DocumentBadge type={row.documentType} />
            <ResultBadge valid={row.valid} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatWhen(row.createdAt)} &middot; {row.verifiedByName ?? "Public scan"}
          </p>
        </div>
      ))}
      {(data?.total ?? 0) > items.length && (
        <p className="text-xs text-muted-foreground">
          Showing the latest {items.length} of {data?.total} scans. See the Verifications tab for all of them.
        </p>
      )}
    </div>
  );
}
