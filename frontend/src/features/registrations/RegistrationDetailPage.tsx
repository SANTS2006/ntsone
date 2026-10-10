import { Loading } from "@/components/Loading";
import * as React from "react";
import { DynamicForm } from "../public-registration/DynamicForm";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, Download, Eye, FileText, Pencil, Ticket as TicketIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RegistrationStatusBadge } from "@/components/StatusBadge";
import { ApiError, downloadAuthenticatedFile } from "@/lib/api";
import { useProgramOutletContext } from "../programs/ProgramDetailLayout";
import { RegistrationVerifications } from "../verifications/VerificationsPage";
import { RegistrantIdCardPanel } from "../idcards/RegistrantIdCardPanel";
import { OrderItemsCard, orderSummary, RegistrationPaymentCard } from "../payments/RegistrationPaymentCard";
import { isOtherOption, otherTextKey } from "../public-registration/DynamicForm";
import { downloadRegistrantDocument } from "../designs/documentImage";
import { downloadRegistrationFile, editRegistrationAnswers } from "./api";
import { useRegistration, useUpdateRegistrationStatus } from "./hooks";
import type { RegistrationFile, RegistrationStatus } from "@/types/api";

function formatValue(value: unknown, otherText?: unknown, followText?: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  // Multiple choice: each ticked option shows its own extra answer.
  if (Array.isArray(value) && followText && typeof followText === "object") {
    const extra = followText as Record<string, unknown>;
    return formatValue(
      value.map((option) => (typeof option === "string" && typeof extra[option] === "string" ? `${option}: ${extra[option]}` : option)),
      otherText,
    );
  }
  // A chosen "Other" option is shown together with what the registrant typed.
  const expand = (option: unknown) =>
    typeof option === "string" && isOtherOption(option) && typeof otherText === "string" && otherText
      ? `${option}: ${otherText}`
      : String(option);
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object") {
      return value.map((v: { filename?: string }) => v.filename ?? "file").join(", ");
    }
    return value.map(expand).join(", ");
  }
  // A single choice (or Yes/No) that asked for more details shows them next to the answer.
  const label = typeof value === "boolean" ? (value ? "Yes" : "No") : undefined;
  if (typeof otherText === "string" && otherText && typeof value !== "object") return `${label ?? String(value)}: ${otherText}`;
  if (label) return label;
  return expand(value);
}

export function RegistrationDetailPage() {
  const { program, terms } = useProgramOutletContext();
  const { registrationId } = useParams<{ registrationId: string }>();
  const { data, isLoading } = useRegistration(program.id, registrationId);
  const updateStatus = useUpdateRegistrationStatus(program.id, registrationId ?? "");
  const [nextStatus, setNextStatus] = React.useState<RegistrationStatus | "">("");
  const [note, setNote] = React.useState("");
  const [downloading, setDownloading] = React.useState<"id-card" | "ticket" | "details" | null>(null);
  const canEdit = program.myRole === "admin";
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);

  if (isLoading || !data) return <Loading label={`Loading ${terms.singular}`} />;

  const handleDownload = async (kind: "id-card" | "ticket") => {
    setDownloading(kind);
    try {
      await downloadRegistrantDocument(kind, `/programs/${program.id}/registrations/${data.registration.id}`, {
        authenticated: true,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to download the ${kind === "id-card" ? "ID card" : "ticket"}`);
    } finally {
      setDownloading(null);
    }
  };

  const { registration, files, history, form, currentForm, missingRequired } = data;

  const saveAnswers = async (responses: Record<string, unknown>) => {
    try {
      await editRegistrationAnswers(program.id, registration.id, responses);
      await queryClient.invalidateQueries({ queryKey: ["registrations", program.id] });
      toast.success("Registration updated");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update the registration");
    }
  };

  const downloadDetails = async () => {
    setDownloading("details");
    try {
      await downloadAuthenticatedFile(`/programs/${program.id}/registrations/${registration.id}/summary.pdf`, `${registration.registrationNumber}.pdf`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to download the registration details");
    } finally {
      setDownloading(null);
    }
  };

  const downloadFile = async (file: RegistrationFile) => {
    try {
      await downloadRegistrationFile(program.id, registration.id, file);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to download ${file.originalFilename}`);
    }
  };

  const handleUpdateStatus = async () => {
    if (!nextStatus) return;
    try {
      await updateStatus.mutateAsync({ status: nextStatus, note: note || undefined });
      toast.success("Status updated");
      setNote("");
      setNextStatus("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update status");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{registration.registrationNumber}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Submitted {new Date(registration.submittedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={downloadDetails} loading={downloading === "details"} disabled={downloading !== null}>
                <FileText className="h-4 w-4" />
                {downloading === "details" ? "Preparing..." : "Details PDF"}
              </Button>
              {program.idCardEnabled && (
                <Button variant="outline" size="sm" onClick={() => handleDownload("id-card")} loading={downloading === "id-card"} disabled={downloading !== null}>
                  <CreditCard className="h-4 w-4" />
                  {downloading === "id-card" ? "Preparing..." : "ID Card"}
                </Button>
              )}
              {program.ticketEnabled && (
                <Button variant="outline" size="sm" onClick={() => handleDownload("ticket")} loading={downloading === "ticket"} disabled={downloading !== null}>
                  <TicketIcon className="h-4 w-4" />
                  {downloading === "ticket" ? "Preparing..." : "Ticket"}
                </Button>
              )}
              {canEdit && currentForm && !editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit answers
                </Button>
              )}
              <RegistrationStatusBadge status={registration.status} label={terms.statusLabel(registration.status)} tone={terms.statusTone?.(registration.status)} />
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const items = orderSummary(registration);
              return items ? (
                <div className="mb-4 rounded-xl border border-primary/20 bg-gradient-brand-soft p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items ordered</p>
                  <p className="mt-0.5 font-medium">{items.text}</p>
                </div>
              ) : null;
            })()}
            {missingRequired.length > 0 && !editing && (
              <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Some required answers are missing</p>
                  <p className="text-muted-foreground">{missingRequired.join(" · ")}</p>
                </div>
              </div>
            )}
            {editing && currentForm ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  The questions below are the program&apos;s current registration questions. Required answers can be filled in later. Uploaded files are not changed here.
                </p>
                <DynamicForm
                  sections={currentForm.sections}
                  fields={currentForm.fields.filter((f) => !f.type.endsWith("_upload"))}
                  layoutMode="single"
                  initialValues={registration.responses as Record<string, unknown>}
                  lenient
                  requireReviewConfirmation={false}
                  submitLabel="Save changes"
                  onCancel={() => setEditing(false)}
                  onSubmit={async (responses) => saveAnswers(responses)}
                />
              </div>
            ) : (
              <>
            {form.sections
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((section) => (
                <div key={section.id} className="mt-6 first:mt-0">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{section.title}</h3>
                  <ResponseGroup
                    fields={form.fields.filter((f) => f.sectionId === section.id)}
                    responses={registration.responses}
                    files={files}
                    onDownload={downloadFile}
                  />
                </div>
              ))}
            {(() => {
              const unassigned = form.fields.filter((f) => !f.sectionId);
              return unassigned.length > 0 ? (
                <div className="mt-6">
                  {form.sections.length > 0 && <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Other</h3>}
                  <ResponseGroup fields={unassigned} responses={registration.responses} files={files} onDownload={downloadFile} />
                </div>
              ) : null;
            })()}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <OrderItemsCard registration={registration} />
        <RegistrationPaymentCard programId={program.id} detail={data} canEdit={canEdit} />
        {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as RegistrationStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose new status" />
              </SelectTrigger>
              <SelectContent>
                {terms.statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {terms.statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <Button onClick={handleUpdateStatus} loading={updateStatus.isPending} disabled={!nextStatus}>
              {updateStatus.isPending ? "Updating..." : "Update status"}
            </Button>
          </CardContent>
        </Card>
        )}

        {program.idCardEnabled && (
          <RegistrantIdCardPanel program={program} registration={registration} canEdit={canEdit} />
        )}

        {(program.idCardEnabled || program.ticketEnabled) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ID card &amp; ticket scans</CardTitle>
            </CardHeader>
            <CardContent>
              <RegistrationVerifications programId={program.id} registrationId={registrationId!} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {history.map((entry) => (
              <div key={entry.id} className="border-l-2 border-border pl-3 text-sm">
                <p className="font-medium">
                  {entry.fromStatus
                    ? `${terms.statusLabel(entry.fromStatus)} → ${terms.statusLabel(entry.toStatus)}`
                    : terms.statusLabel(entry.toStatus)}
                </p>
                {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ResponseGroup({
  fields,
  responses,
  files,
  onDownload,
}: {
  fields: { fieldKey: string; label: string }[];
  responses: Record<string, unknown>;
  files: RegistrationFile[];
  onDownload: (file: RegistrationFile) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const fileMatches = files.filter((f) => f.fieldKey === field.fieldKey);
        const followUpFiles = files.filter((f) => f.fieldKey === otherTextKey(field.fieldKey) || f.fieldKey.startsWith(`${field.fieldKey}__fu__`));
        return (
          <div key={field.fieldKey}>
            <dt className="text-xs uppercase text-muted-foreground">{field.label}</dt>
            {followUpFiles.length > 0 && (
              <dd className="mt-1 flex flex-col gap-2">
                <span className="text-sm">{formatValue(responses[field.fieldKey], responses[otherTextKey(field.fieldKey)], responses[`${field.fieldKey}__follow`])}</span>
                {followUpFiles.map((f) => (
                  <FileRow key={f.id} file={f} onDownload={onDownload} />
                ))}
              </dd>
            )}
            {followUpFiles.length > 0 ? null : fileMatches.length > 0 ? (
              <dd className="mt-1 flex flex-col gap-2">
                {fileMatches.map((f) => (
                  <FileRow key={f.id} file={f} onDownload={onDownload} />
                ))}
              </dd>
            ) : (
              <dd className="text-sm">{formatValue(responses[field.fieldKey], responses[otherTextKey(field.fieldKey)], responses[`${field.fieldKey}__follow`])}</dd>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FileRow({ file, onDownload }: { file: RegistrationFile; onDownload: (file: RegistrationFile) => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  const isImage = file.mimeType.startsWith("image/");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-brand-soft text-primary">
        {isImage ? (
          <img src={file.secureUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.originalFilename}>
          {file.originalFilename}
        </p>
        <p className="text-xs text-muted-foreground">{formatSize(file.sizeBytes)}</p>
      </div>
      <a
        href={file.secureUrl}
        target="_blank"
        rel="noreferrer"
        title="Open in a new tab"
        aria-label={`Open ${file.originalFilename}`}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Eye className="h-4 w-4" />
      </a>
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        aria-label={`Download ${file.originalFilename}`}
        onClick={async () => {
          setBusy(true);
          try {
            await onDownload(file);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download className="h-4 w-4" />
        Download
      </Button>
    </div>
  );
}
