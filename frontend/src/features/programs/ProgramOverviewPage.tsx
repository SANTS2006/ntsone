import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CalendarClock, CheckCircle2, ClipboardList, Copy, Users2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/StatCard";
import { ApiError } from "@/lib/api";
import { useProgramOutletContext } from "./ProgramDetailLayout";
import {
  useDeleteProgram,
  useDuplicateProgram,
  useProgramAction,
  useUpdateProgram,
} from "./hooks";
import * as programsApi from "./api";
import { useProgramStats } from "../registrations/hooks";
import { IdCardSettingsCard } from "../idcards/IdCardSettingsCard";
import { PaymentSettingsCard } from "../payments/PaymentSettingsCard";
import { RegistrationRulesCard } from "./RegistrationRulesCard";
import { NotificationSettingsCard } from "./NotificationSettingsCard";
import { TicketSettingsCard } from "../tickets/TicketSettingsCard";
import { DeleteProgramDialog } from "./DeleteProgramDialog";
import { useAuth } from "@/app/AuthContext";
import { MembersCard } from "../access/MembersCard";
import { RegistrationNumberCard } from "./RegistrationNumberCard";
import type { Program } from "@/types/api";

const schema = z.object({
  name: z.string().min(2),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
  registrationStartDate: z.string().optional(),
  registrationEndDate: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function toInputDate(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function ProgramOverviewPage() {
  const { program } = useProgramOutletContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats } = useProgramStats(program.id);
  const updateProgram = useUpdateProgram(program.id);
  const deleteProgram = useDeleteProgram();
  const duplicateProgram = useDuplicateProgram();
  const publish = useProgramAction(programsApi.publishProgram);
  const unpublish = useProgramAction(programsApi.unpublishProgram);
  const closeRegistration = useProgramAction(programsApi.closeRegistration);
  const reopenRegistration = useProgramAction(programsApi.reopenRegistration);
  const archiveProgram = useProgramAction(programsApi.archiveProgram);
  const [uploading, setUploading] = React.useState(false);
  const canEdit = program.myRole === "admin";

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      name: program.name,
      shortDescription: program.shortDescription ?? "",
      description: program.description ?? "",
      registrationStartDate: toInputDate(program.registrationStartDate),
      registrationEndDate: toInputDate(program.registrationEndDate),
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        ...values,
        registrationStartDate: values.registrationStartDate || undefined,
        registrationEndDate: values.registrationEndDate || undefined,
      };
      await updateProgram.mutateAsync(payload);
      toast.success("Program updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update program");
    }
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${label.toLowerCase()}`);
    }
  };

  const onThumbnailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const signature = await programsApi.getProgramUploadSignature(program.id);
      const { secureUrl } = await programsApi.uploadToCloudinary(file, signature);
      await programsApi.setProgramThumbnail(program.id, secureUrl);
      toast.success("Thumbnail updated");
    } catch {
      toast.error("Failed to upload thumbnail");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total registrations" value={stats?.total ?? 0} icon={Users2} />
        <StatCard label="Today" value={stats?.today ?? 0} icon={CalendarClock} />
        <StatCard label="This week" value={stats?.thisWeek ?? 0} icon={ClipboardList} />
        <StatCard label="Approved" value={stats?.byStatus.approved ?? 0} icon={CheckCircle2} />
      </div>

      {!canEdit ? (
        <ProgramDetailsReadOnly program={program} />
      ) : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Program details</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shortDescription">Short description</Label>
                <Input id="shortDescription" {...register("shortDescription")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Full description</Label>
                <Textarea id="description" rows={5} {...register("description")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="registrationStartDate">Registration opens</Label>
                  <Input id="registrationStartDate" type="date" {...register("registrationStartDate")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="registrationEndDate">Registration closes</Label>
                  <Input id="registrationEndDate" type="date" {...register("registrationEndDate")} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="thumbnail">Thumbnail image</Label>
                <Input id="thumbnail" type="file" accept="image/*" onChange={onThumbnailChange} disabled={uploading} />
                {program.thumbnailUrl && (
                  <img src={program.thumbnailUrl} alt="" className="mt-2 h-32 w-full rounded-md object-cover" />
                )}
              </div>
              <Button type="submit" loading={updateProgram.isPending} disabled={!isDirty} className="w-fit">
                {updateProgram.isPending ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lifecycle actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {program.status === "draft" && (
              <Button loading={publish.isPending} onClick={() => runAction("Program published", () => publish.mutateAsync(program.id))}>
                Publish program
              </Button>
            )}
            {program.status === "published" && (
              <>
                <Button
                  variant="outline"
                  loading={unpublish.isPending}
                  onClick={() => runAction("Program unpublished", () => unpublish.mutateAsync(program.id))}
                >
                  Unpublish
                </Button>
                {program.registrationEnabled ? (
                  <Button
                    variant="outline"
                    loading={closeRegistration.isPending}
                    onClick={() => runAction("Registration closed", () => closeRegistration.mutateAsync(program.id))}
                  >
                    Close registration
                  </Button>
                ) : (
                  <Button
                    loading={reopenRegistration.isPending}
                    onClick={() => runAction("Registration reopened", () => reopenRegistration.mutateAsync(program.id))}
                  >
                    Open registration
                  </Button>
                )}
              </>
            )}
            {program.status === "closed" && (
              <Button
                loading={reopenRegistration.isPending}
                onClick={() => runAction("Registration reopened", () => reopenRegistration.mutateAsync(program.id))}
              >
                Reopen registration
              </Button>
            )}
            {program.status !== "archived" && (
              <Button
                variant="outline"
                loading={archiveProgram.isPending}
                onClick={() => runAction("Program archived", () => archiveProgram.mutateAsync(program.id))}
              >
                Archive program
              </Button>
            )}
            <Button
              variant="outline"
              loading={duplicateProgram.isPending}
              onClick={async () => {
                try {
                  const copy = await duplicateProgram.mutateAsync(program.id);
                  toast.success("Program duplicated");
                  navigate(`/admin/programs/${copy.id}`);
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Failed to duplicate program");
                }
              }}
            >
              <Copy className="h-4 w-4" />
              {duplicateProgram.isPending ? "Duplicating..." : "Duplicate program"}
            </Button>
            <DeleteProgramDialog
              programName={program.name}
              registrationCount={stats?.total ?? 0}
              onConfirm={async () => {
                try {
                  await deleteProgram.mutateAsync(program.id);
                  toast.success("Program deleted");
                  navigate("/admin/programs");
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Failed to delete program");
                  throw err;
                }
              }}
            />
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <RegistrationNumberCard program={program} />
        </div>
        {canEdit && user && program.kind !== "order_form" && (
          <div className="lg:col-span-3">
            <MembersCard kind="programs" id={program.id} currentUserId={user.id} />
          </div>
        )}
        <div className="lg:col-span-3">
          <RegistrationRulesCard program={program} />
        </div>
        <div className="lg:col-span-3">
          <NotificationSettingsCard program={program} />
        </div>
        {program.kind !== "order_form" && (
          <div className="lg:col-span-3">
            <PaymentSettingsCard program={program} />
          </div>
        )}
        <div className="lg:col-span-3">
          <IdCardSettingsCard program={program} />
        </div>
        <div className="lg:col-span-3">
          <TicketSettingsCard program={program} />
        </div>
      </div>
      )}
    </div>
  );
}

function ProgramDetailsReadOnly({ program }: { program: Program }) {
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
  const rows = [
    { label: "Status", value: program.status },
    { label: "Registration", value: program.registrationEnabled ? "Open" : "Closed" },
    { label: "Registration opens", value: fmt(program.registrationStartDate) },
    { label: "Registration closes", value: fmt(program.registrationEndDate) },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Program details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {program.shortDescription && <p className="text-sm font-medium">{program.shortDescription}</p>}
        {program.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{program.description}</p>}
        <dl className="grid grid-cols-2 gap-4 border-t border-border/60 pt-4 sm:grid-cols-4">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
              <dd className="text-sm font-medium capitalize">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
