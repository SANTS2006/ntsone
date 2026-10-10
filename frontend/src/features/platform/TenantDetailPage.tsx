import { Loading } from "@/components/Loading";
import { Link, useParams } from "react-router-dom";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant, useTenantPrograms, useTenantUsers, useUpdateUserStatus } from "./hooks";
import { usePageMeta } from "@/lib/seo";

export function TenantDetailPage() {
  usePageMeta({ title: "Organization" });
  const { tenantId } = useParams<{ tenantId: string }>();
  const { data: tenant, isLoading: tenantLoading } = useTenant(tenantId);
  const usersRange = useDateRange();
  const programsRange = useDateRange();
  const { data: users, isLoading: usersLoading } = useTenantUsers(tenantId, { dateFrom: usersRange.dateFrom, dateTo: usersRange.dateTo });
  const { data: programs, isLoading: programsLoading } = useTenantPrograms(tenantId, { dateFrom: programsRange.dateFrom, dateTo: programsRange.dateTo });
  const updateStatus = useUpdateUserStatus(tenantId ?? "");

  const toggleStatus = async (userId: string, name: string, status: string) => {
    const next = status === "active" ? "suspended" : "active";
    try {
      await updateStatus.mutateAsync({ userId, status: next });
      toast.success(next === "suspended" ? `${name} has been suspended` : `${name} has been reactivated`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update the user");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <LinkButton to="/admin/tenants" variant="outline" size="sm" className="mb-3">
            &larr; Back to accounts
          </LinkButton>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {tenantLoading ? "Loading..." : (tenant?.name ?? "Account")}
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage this account's users and programs ({tenant?.slug})
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Users</CardTitle>
          <DateRangeFilter range={usersRange} label="Joined" />
          <ExportButtons path={`/platform/tenants/${tenantId}/users/export`} params={{ dateFrom: usersRange.dateFrom, dateTo: usersRange.dateTo }} fileLabel={`${tenant?.name ?? "Account"} users`} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gradient-brand-soft">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Role</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground"><Loading inline label="Loading" /></TableCell>
                </TableRow>
              )}
              {users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="capitalize">{user.role.replace("_", " ")}</TableCell>
                  <TableCell>
                    <Badge variant={user.status === "active" ? "success" : "secondary"}>{user.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={user.status === "active" ? "outline" : "default"}
                      loading={updateStatus.isPending && updateStatus.variables?.userId === user.id}
                      disabled={updateStatus.isPending}
                      onClick={() => toggleStatus(user.id, user.name, user.status)}
                    >
                      {user.status === "active" ? "Suspend" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Programs</CardTitle>
          <DateRangeFilter range={programsRange} label="Created" />
          <ExportButtons path={`/platform/tenants/${tenantId}/programs/export`} params={{ dateFrom: programsRange.dateFrom, dateTo: programsRange.dateTo }} fileLabel={`${tenant?.name ?? "Account"} programs`} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gradient-brand-soft">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Registration</TableHead>
                <TableHead className="font-semibold">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programsLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground"><Loading inline label="Loading" /></TableCell>
                </TableRow>
              )}
              {programs?.map((program) => (
                <TableRow key={program.id}>
                  <TableCell>
                    <Link to={`/admin/programs/${program.id}`} className="font-medium text-primary hover:opacity-80">
                      {program.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{program.status}</TableCell>
                  <TableCell>{program.registrationEnabled ? "Open" : "Closed"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(program.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
