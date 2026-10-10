import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, Rocket, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { useCreateUser, useRemoveTeamMember, useUpdateUser, useUsersList } from "./hooks";
import { ManageAccessDialog } from "./AccessDialog";
import type { UserRole } from "@/types/api";
import { usePageMeta } from "@/lib/seo";

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10, "At least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/d/, "Include a number"),
  role: z.enum(["program_admin", "viewer"]),
});
type CreateUserForm = z.infer<typeof createUserSchema>;

function CreateUserDialog() {
  const [open, setOpen] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const createUser = useCreateUser();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "viewer" },
  });

  const onSubmit = async (values: CreateUserForm) => {
    try {
      await createUser.mutateAsync(values);
      toast.success(`Invitation emailed to ${values.email}`);
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
          <p className="text-sm text-muted-foreground">
            They&apos;ll receive an email with their role, this temporary password, and a link to sign in. They get a space of their own too, where they can create their own programs, polls and businesses, and they stay on your team under this role. If they already have an account, they are just added to your team.
          </p>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email</Label>
            <Input type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invitePassword">Temporary password</Label>
            <div className="relative">
              <Input
                id="invitePassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="pr-10"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              {...register("role")}
            >
              <option value="viewer">Viewer</option>
              <option value="program_admin">Program Admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" loading={createUser.isPending}>
              {createUser.isPending ? "Creating..." : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Changes the role someone was invited into; for people with their own space it applies to everything of yours they can open. */
function RoleSelect({ userId, name, role }: { userId: string; name: string; role: UserRole }) {
  const update = useUpdateUser();
  return (
    <Select
      value={role}
      onValueChange={async (next) => {
        try {
          await update.mutateAsync({ userId, input: { role: next as UserRole } });
          toast.success(`${name} is now a ${next === "viewer" ? "viewer" : "program admin"}`);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Couldn't change the role");
        }
      }}
      disabled={update.isPending}
    >
      <SelectTrigger className="h-8 w-36" aria-label={`Role of ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="viewer">Viewer</SelectItem>
        <SelectItem value="program_admin">Program admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Asks for confirmation in a dialog before taking someone off the team. */
function RemoveFromTeamButton({ userId, name }: { userId: string; name: string }) {
  const remove = useRemoveTeamMember();
  const [open, setOpen] = React.useState(false);

  const confirm = async () => {
    try {
      await remove.mutateAsync(userId);
      toast.success(`${name} was removed from your team`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove them");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !remove.isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Remove ${name} from your team`} title="Remove from your team (their own space stays)">
          <UserMinus className="h-4 w-4 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name} from your team?</DialogTitle>
          <DialogDescription>
            They will lose access to all of your programs, voting polls and businesses. Their own space and anything they created in it stays theirs, and you can invite them again later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} loading={remove.isPending}>
            <UserMinus className="h-4 w-4" />
            Remove from team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPage() {
  usePageMeta({ title: "Users" });
  const [search, setSearch] = React.useState("");
  const range = useDateRange();
  const { data, isLoading } = useUsersList({ page: 1, pageSize: 50, search: search || undefined, dateFrom: range.dateFrom, dateTo: range.dateTo });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Team</h1>
          <p className="text-sm text-muted-foreground">Invite teammates and manage their program access.</p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input placeholder="Search users..." aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <ExportButtons path="/users/export" params={{ search, dateFrom: range.dateFrom, dateTo: range.dateTo }} fileLabel="Users" />
      </div>
      <DateRangeFilter range={range} label="Joined" />

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-gradient-brand-soft">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Role</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground"><Loading inline label="Loading" /></TableCell>
              </TableRow>
            )}
            {data?.items.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {user.role === "admin" ? (
                    <span className="capitalize">Admin</span>
                  ) : (
                    <RoleSelect userId={user.id} name={user.name} role={user.role} />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.status === "active" ? "success" : "secondary"}>{user.status}</Badge>
                    {user.ownSpace && (
                      <Badge variant="outline" className="gap-1" title="Has a space of their own, with their own programs, polls and businesses">
                        <Rocket className="h-3 w-3" aria-hidden="true" />
                        Own space
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {user.role !== "admin" && <ManageAccessDialog userId={user.id} userName={user.name} />}
                    {user.ownSpace && <RemoveFromTeamButton userId={user.id} name={user.name} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export type { UserRole };
