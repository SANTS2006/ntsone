import { Loading } from "@/components/Loading";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Mail, Trash2, UserPlus, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiFetch } from "@/lib/api";

export type AccessKind = "programs" | "polls" | "businesses";

interface Person {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "viewer";
  status: "active" | "suspended";
  /** The account owner, who always has full access. */
  inherited: boolean;
  addedAt: string | null;
}

const NOUN: Record<AccessKind, string> = { programs: "program", polls: "voting poll", businesses: "business" };

/**
 * Who can see and manage this program, poll, or business, and a way for its admins to give others
 * access. Invited people keep their own space; this only adds what they can do here.
 */
export function MembersCard({ kind, id, currentUserId }: { kind: AccessKind; id: string; currentUserId: string }) {
  const queryClient = useQueryClient();
  const key = ["access", kind, id] as const;
  const path = `/${kind}/${id}/members`;
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => apiFetch<Person[]>(path) });
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "viewer">("viewer");
  const [busy, setBusy] = React.useState(false);
  const noun = NOUN[kind];

  const set = (people: Person[]) => queryClient.setQueryData(key, people);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return toast.error("Enter a valid email address");
    setBusy(true);
    try {
      set(await apiFetch<Person[]>(path, { method: "POST", body: { email: address, name: name.trim() || undefined, role } }));
      toast.success(`Access given to ${address}`);
      setOpen(false);
      setEmail("");
      setName("");
      setRole("viewer");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't give access");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (person: Person, next: "admin" | "viewer") => {
    try {
      set(await apiFetch<Person[]>(`${path}/${person.userId}`, { method: "PATCH", body: { role: next } }));
      toast.success(`${person.name} is now ${next === "admin" ? "an admin" : "a viewer"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't change the role");
    }
  };

  const [toRemove, setToRemove] = React.useState<Person | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      set(await apiFetch<Person[]>(`${path}/${toRemove.userId}`, { method: "DELETE" }));
      toast.success("Access removed");
      setToRemove(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove access");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            People with access
          </CardTitle>
          <CardDescription>Give others access to this {noun}. Admins can manage it; viewers can only look.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0">
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Give access to this {noun}</DialogTitle>
              <DialogDescription>
                If they already have an account they simply get access. If not, we create one for them, with a space of their own, and email their sign-in details.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={invite} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="member-email">Email</Label>
                <Input id="member-email" type="email" autoComplete="off" placeholder="Enter their email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="member-name">Name (for new people)</Label>
                <Input id="member-name" autoComplete="off" placeholder="Enter their full name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Access</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "viewer")}>
                  <SelectTrigger aria-label="Access level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer: can see it, not change it</SelectItem>
                    <SelectItem value="admin">Admin: can manage it and invite others</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" loading={busy}>
                  <Mail className="h-4 w-4" />
                  Give access
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border/70">
        {isLoading && <Loading label="Loading" />}
        {data?.map((person) => (
          <div key={person.userId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <Avatar name={person.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {person.name}
                {person.userId === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{person.email}</p>
            </div>
            {person.inherited ? (
              <Badge variant="outline" className="gap-1">
                <Crown className="h-3 w-3" aria-hidden="true" />
                Account owner
              </Badge>
            ) : (
              <div className="flex items-center gap-2">
                <Select value={person.role} onValueChange={(v) => void changeRole(person, v as "admin" | "viewer")}>
                  <SelectTrigger className="h-8 w-28" aria-label={`Access for ${person.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" aria-label={`Remove ${person.name}`} onClick={() => setToRemove(person)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>
        ))}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">Only you so far.</p>}
      </CardContent>
      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={`Remove ${toRemove?.name ?? "this person"}'s access?`}
        description={`They will no longer be able to open this ${noun}. Their account and anything else they have access to stays as it is, and you can give them access again later.`}
        confirmLabel="Remove access"
        busy={removing}
        onConfirm={remove}
      />
    </Card>
  );
}
