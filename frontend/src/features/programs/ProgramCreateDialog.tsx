import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/app/AuthContext";
import { useCreateProgram } from "./hooks";
import { listTenants } from "../platform/api";
import { ApiError } from "@/lib/api";
import { Plus } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function ProgramCreateDialog() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const createProgram = useCreateProgram();
  // The platform super admin belongs to no account, so it picks which one the program is for.
  const choosesAccount = user?.role === "super_admin";
  const { data: accounts } = useQuery({
    queryKey: ["platform-tenants", "all-for-select"],
    queryFn: () => listTenants({ page: 1, pageSize: 100 }),
    enabled: choosesAccount && open,
  });
  const [tenantId, setTenantId] = React.useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (choosesAccount && !tenantId) {
      toast.error("Choose the account this program belongs to");
      return;
    }
    try {
      const program = await createProgram.mutateAsync(choosesAccount ? { ...values, tenantId } : values);
      toast.success("Program created");
      setOpen(false);
      reset();
      navigate(`/admin/programs/${program.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create program");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New Program
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new program</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {choosesAccount && (
            <div className="flex flex-col gap-1.5">
              <Label>Account</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose the account this program belongs to" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.items.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Program name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shortDescription">Short description</Label>
            <Input id="shortDescription" placeholder="Shown on cards and listings" {...register("shortDescription")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Full description</Label>
            <Textarea id="description" rows={4} {...register("description")} />
          </div>
          <DialogFooter>
            <Button type="submit" loading={createProgram.isPending}>
              {createProgram.isPending ? "Creating..." : "Create program"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
