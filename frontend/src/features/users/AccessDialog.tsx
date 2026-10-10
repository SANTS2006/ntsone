import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/app/AuthContext";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { listPrograms } from "../programs/api";
import { listPolls } from "../polls/api";
import { listBusinesses } from "../businesses/api";

type Role = "admin" | "viewer";

interface AccessKind {
  key: string;
  label: string;
  singular: string;
  /** Items this user can be given access to. */
  options: () => Promise<{ id: string; name: string; tenantId?: string }[]>;
  /** Normalises the membership rows the API returns. */
  toRows: (raw: Record<string, string>[]) => { id: string; name: string; role: Role }[];
  body: (id: string, role: Role) => Record<string, string>;
}

/** Everything a teammate can be given admin or viewer access to, one tab each. */
export const ACCESS_KINDS: AccessKind[] = [
  {
    key: "programs",
    label: "Programs",
    singular: "program",
    options: async () => (await listPrograms({ page: 1, pageSize: 100 })).items.map((p) => ({ id: p.id, name: p.name, tenantId: p.tenantId })),
    toRows: (raw) => raw.map((r) => ({ id: r.programId!, name: r.programName!, role: r.roleOnProgram as Role })),
    body: (id, role) => ({ programId: id, roleOnProgram: role }),
  },
  {
    key: "polls",
    label: "Voting polls",
    singular: "poll",
    options: async () => (await listPolls({ page: 1, pageSize: 100 })).items.map((p) => ({ id: p.id, name: p.name, tenantId: p.tenantId })),
    toRows: (raw) => raw.map((r) => ({ id: r.pollId!, name: r.pollName!, role: r.roleOnPoll as Role })),
    body: (id, role) => ({ pollId: id, roleOnPoll: role }),
  },
  {
    key: "businesses",
    label: "Businesses",
    singular: "business",
    options: async () => (await listBusinesses({ page: 1, pageSize: 100 })).items.map((b) => ({ id: b.id, name: b.name, tenantId: b.tenantId })),
    toRows: (raw) => raw.map((r) => ({ id: r.businessId!, name: r.businessName!, role: r.roleOnBusiness as Role })),
    body: (id, role) => ({ businessId: id, roleOnBusiness: role }),
  },
];

function AccessTab({ userId, kind }: { userId: string; kind: AccessKind }) {
  const queryClient = useQueryClient();
  const queryKey = ["user-access", userId, kind.key];
  const [itemId, setItemId] = React.useState("");
  const [role, setRole] = React.useState<Role>("viewer");

  const { data: rows } = useQuery({
    queryKey,
    queryFn: async () => kind.toRows(await apiFetch<Record<string, string>[]>(`/users/${userId}/${kind.key}`)),
  });
  const { user: me } = useAuth();
  const { data: allOptions } = useQuery({ queryKey: ["access-options", kind.key], queryFn: kind.options });
  // Only things in your own account can be shared from here (shared-with-you items belong to someone else).
  const options = allOptions?.filter((o) => !o.tenantId || o.tenantId === me?.tenantId);

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Something went wrong");
  const grant = useMutation({
    mutationFn: () => apiFetch(`/users/${userId}/${kind.key}`, { method: "POST", body: kind.body(itemId, role) }),
    onSuccess: () => {
      setItemId("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${userId}/${kind.key}/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError,
  });

  return (
    <div className="flex flex-col gap-3">
      {rows?.map((row) => (
        <div key={row.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-sm font-medium">{row.name}</p>
            <Badge variant="outline" className="mt-1 text-[10px] capitalize">
              {row.role}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" aria-label={`Remove access to ${row.name}`} onClick={() => revoke.mutate(row.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">No {kind.singular} access yet.</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="min-w-0 flex-1" aria-label={`Choose a ${kind.singular}`}>
            <SelectValue placeholder={`Choose ${kind.singular}`} />
          </SelectTrigger>
          <SelectContent>
            {options?.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="w-28" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={!itemId} loading={grant.isPending} onClick={() => grant.mutate()}>
          Grant
        </Button>
      </div>
    </div>
  );
}

/** Gives a teammate admin or viewer access to individual programs, polls, and businesses. */
export function ManageAccessDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState(ACCESS_KINDS[0]!.key);
  const kind = ACCESS_KINDS.find((k) => k.key === tab)!;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Manage access for ${userName}`}>
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access &middot; {userName}</DialogTitle>
          <DialogDescription>Admins can change settings; viewers can only look.</DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label="Access type" className="flex gap-1 rounded-lg bg-muted p-1">
          {ACCESS_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={tab === k.key}
              onClick={() => setTab(k.key)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === k.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        {open && <AccessTab key={kind.key} userId={userId} kind={kind} />}
      </DialogContent>
    </Dialog>
  );
}
