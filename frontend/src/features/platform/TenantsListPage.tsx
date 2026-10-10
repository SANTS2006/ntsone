import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { useTenantsList } from "./hooks";
import { usePageMeta } from "@/lib/seo";

export function TenantsListPage() {
  usePageMeta({ title: "Organizations" });
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const { data, isLoading } = useTenantsList({ page, pageSize: 20, dateFrom: range.dateFrom, dateTo: range.dateTo });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Every account on the platform. Open one to manage its users and programs.
          </p>
        </div>
        <ExportButtons path="/platform/tenants/export" params={{ dateFrom: range.dateFrom, dateTo: range.dateTo }} fileLabel="Accounts" />
      </div>
      <DateRangeFilter range={range} onChange={() => setPage(1)} label="Created" />

      {!isLoading && data?.items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No accounts yet.</CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-gradient-brand-soft">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Account</TableHead>
              <TableHead className="font-semibold">Owner</TableHead>
              <TableHead className="font-semibold">Users</TableHead>
              <TableHead className="font-semibold">Programs</TableHead>
              <TableHead className="font-semibold">Voting polls</TableHead>
              <TableHead className="font-semibold">Businesses</TableHead>
              <TableHead className="font-semibold">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground"><Loading inline label="Loading" /></TableCell>
              </TableRow>
            )}
            {data?.items.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand-soft text-primary">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-medium">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{tenant.ownerName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{tenant.ownerEmail ?? ""}</p>
                </TableCell>
                <TableCell>{tenant.userCount}</TableCell>
                <TableCell>{tenant.programCount}</TableCell>
                <TableCell>{tenant.pollCount}</TableCell>
                <TableCell>{tenant.businessCount}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(tenant.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <LinkButton to={`/admin/tenants/${tenant.id}`} variant="ghost" size="sm">
                    View
                  </LinkButton>
                </TableCell>
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
