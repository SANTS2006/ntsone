import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, DatabaseBackup, Download, Loader2, RefreshCw, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Loading } from "@/components/Loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch, downloadAuthenticatedFile } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";

interface BackupItem {
  id: string;
  type: "automatic" | "manual" | "pre_restore";
  status: "running" | "completed" | "failed" | "deleted";
  verificationStatus: "pending" | "valid" | "invalid";
  storage: string;
  sizeBytes: number | null;
  checksumSha256: string | null;
  encrypted: boolean;
  rowTotal: number | null;
  createdBy: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  lastRestoredAt: string | null;
  restorable: boolean;
}
interface RestoreItem {
  id: string;
  backupId: string;
  safetyBackupId: string | null;
  status: "pending" | "preparing" | "backing_up_current_database" | "restoring" | "verifying" | "completed" | "failed";
  active: boolean;
  requestedBy: string | null;
  error: string | null;
  rolledBack: boolean;
  createdAt: string;
  completedAt: string | null;
}
interface Overview {
  enabled: boolean;
  ready: boolean;
  problem: string | null;
  storage: string;
  encrypted: boolean;
  scheduleHourUtc: number;
  policy: { retentionDays: number; keepLatest: number };
  nextScheduledAt: string | null;
  latestValid: BackupItem | null;
  latestFailed: BackupItem | null;
  running: BackupItem | null;
  activeRestore: RestoreItem | null;
  totalBackups: number;
  totalBytes: number;
  stale: boolean;
}
interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}
interface Preview {
  backup: BackupItem;
  canRestore: boolean;
  problems: string[];
  confirmationPhrase: string;
  warning: string;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const fmtSize = (n: number | null) => (n === null ? "—" : n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const TYPE_LABEL = { automatic: "Daily (automatic)", manual: "Manual", pre_restore: "Before a restore" } as const;
const STAGES = [
  ["pending", "Waiting to start"],
  ["preparing", "Checking the backup file"],
  ["backing_up_current_database", "Saving a safety copy of the current data"],
  ["restoring", "Restoring the data"],
  ["verifying", "Checking the restored data"],
  ["completed", "Done"],
] as const;
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function StatusBadge({ b }: { b: BackupItem }) {
  if (b.status === "running") return <Badge variant="warning">Running</Badge>;
  if (b.status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (b.status === "deleted") return <Badge variant="secondary">Deleted</Badge>;
  if (b.verificationStatus === "valid") return <Badge variant="success">Valid</Badge>;
  if (b.verificationStatus === "invalid") return <Badge variant="destructive">Invalid</Badge>;
  return <Badge variant="warning">Not verified</Badge>;
}

/** Backup & Recovery, for the platform's super admin: status, history, manual backups, verification, retention and restore. */
export function BackupsPage() {
  usePageMeta({ title: "Backup & Recovery" });
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["platform-backups"] });
  const overview = useQuery({ queryKey: ["platform-backups", "overview"], queryFn: () => apiFetch<Overview>("/platform/backups/overview") });
  const [page, setPage] = React.useState(1);
  const list = useQuery({ queryKey: ["platform-backups", "list", page], queryFn: () => apiFetch<Paged<BackupItem>>(`/platform/backups?page=${page}&pageSize=10`) });
  const restores = useQuery({ queryKey: ["platform-backups", "restores"], queryFn: () => apiFetch<Paged<RestoreItem>>("/platform/backups/restores?pageSize=5") });
  const [restoreFor, setRestoreFor] = React.useState<BackupItem | null>(null);
  const [deleteFor, setDeleteFor] = React.useState<BackupItem | null>(null);
  const [downloadFor, setDownloadFor] = React.useState<BackupItem | null>(null);

  const create = useMutation({
    mutationFn: () => apiFetch<BackupItem>("/platform/backups", { method: "POST" }),
    onSuccess: () => {
      toast.success("Backup started. It will appear below when it finishes.");
      void refresh();
    },
    onError: (err) => toast.error(errorText(err, "Could not start the backup")),
  });
  const verify = useMutation({
    mutationFn: (id: string) => apiFetch<BackupItem>(`/platform/backups/${id}/verify`, { method: "POST", timeoutMs: 240_000 }),
    onSuccess: (b) => {
      if (b.verificationStatus === "valid") toast.success("The backup is valid");
      else toast.error(b.error ?? "The backup failed verification");
      void refresh();
    },
    onError: (err) => toast.error(errorText(err, "Could not verify the backup")),
  });

  if (overview.isLoading) return <Loading label="Loading backups" />;
  if (overview.isError || !overview.data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="font-medium">Could not load the backup status.</p>
          <p className="text-sm text-muted-foreground">{errorText(overview.error, "The server did not answer.")}</p>
          <Button onClick={() => void overview.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
  const o = overview.data;
  const busy = !!o.running || !!o.activeRestore;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <DatabaseBackup className="h-6 w-6 text-primary" aria-hidden="true" />
            Backup &amp; Recovery
          </h1>
          <p className="text-sm text-muted-foreground">A full, encrypted copy of the database is made every day and checked before it counts.</p>
        </div>
        <Button onClick={() => create.mutate()} disabled={!o.ready || busy || create.isPending}>
          {create.isPending || o.running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <DatabaseBackup className="mr-2 h-4 w-4" aria-hidden="true" />}
          Back up now
        </Button>
      </div>

      {!o.ready && (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Backups are not running.</p>
            <p className="text-muted-foreground">{o.problem}</p>
          </div>
        </div>
      )}
      {o.ready && o.stale && (
        <div role="alert" className="flex gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">There is no valid backup from the last 26 hours.</p>
            <p className="text-muted-foreground">{o.latestFailed?.error ? `The last attempt failed: ${o.latestFailed.error}` : "The next daily backup has not run yet."}</p>
          </div>
        </div>
      )}

      {o.activeRestore && <RestoreProgress restoreId={o.activeRestore.id} onDone={refresh} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={ShieldCheck} label="Latest valid backup" value={o.latestValid ? fmtDate(o.latestValid.startedAt) : "None yet"} hint={o.latestValid ? `${fmtSize(o.latestValid.sizeBytes)}, ${o.latestValid.rowTotal ?? 0} records` : undefined} />
        <Stat icon={Clock} label="Next daily backup" value={o.nextScheduledAt ? fmtDate(o.nextScheduledAt) : "Not scheduled"} hint={`Every day at ${String(o.scheduleHourUtc).padStart(2, "0")}:00 UTC`} />
        <Stat icon={DatabaseBackup} label="Stored backups" value={`${o.totalBackups}`} hint={fmtSize(o.totalBytes)} />
        <Stat icon={ShieldCheck} label="Storage" value={o.storage === "s3" ? "Cloud storage" : "Local disk"} hint={o.encrypted ? "Encrypted (AES-256)" : "Not encrypted"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup history</CardTitle>
          <CardDescription>A backup can only be restored once it has been verified as valid.</CardDescription>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Loading inline label="Loading history" />
          ) : list.isError ? (
            <div className="space-y-2 py-4 text-center text-sm">
              <p>{errorText(list.error, "Could not load the history.")}</p>
              <Button size="sm" variant="outline" onClick={() => void list.refetch()}>
                Try again
              </Button>
            </div>
          ) : list.data && list.data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No backups yet. Press Back up now to make the first one.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data?.items.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(b.startedAt)}</TableCell>
                      <TableCell>{TYPE_LABEL[b.type]}</TableCell>
                      <TableCell>
                        <StatusBadge b={b} />
                        {b.error && <p className="mt-1 max-w-xs text-xs text-destructive">{b.error}</p>}
                      </TableCell>
                      <TableCell>{fmtSize(b.sizeBytes)}</TableCell>
                      <TableCell>{b.createdBy ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          {b.status === "completed" && (
                            <Button size="sm" variant="outline" disabled={verify.isPending} onClick={() => verify.mutate(b.id)}>
                              {verify.isPending && verify.variables === b.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
                              Verify
                            </Button>
                          )}
                          {b.restorable && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRestoreFor(b)}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              Restore
                            </Button>
                          )}
                          {b.status === "completed" && (
                            <Button size="icon" variant="ghost" aria-label="Download this backup" onClick={() => setDownloadFor(b)}>
                              <Download className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                          {(b.status === "completed" || b.status === "failed") && (
                            <Button size="icon" variant="ghost" aria-label="Delete this backup" onClick={() => setDeleteFor(b)}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {list.data && list.data.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 text-sm">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span>
                    Page {list.data.page} of {list.data.totalPages}
                  </span>
                  <Button size="sm" variant="outline" disabled={page >= list.data.totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <PolicyCard policy={o.policy} onSaved={refresh} />
        <Card>
          <CardHeader>
            <CardTitle>Restore history</CardTitle>
            <CardDescription>Every restore, with the safety copy that was taken first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {restores.isLoading ? (
              <Loading inline label="Loading" />
            ) : restores.data && restores.data.items.length > 0 ? (
              restores.data.items.map((r) => (
                <div key={r.id} className="rounded-lg border border-border/70 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>{fmtDate(r.createdAt)}</span>
                    {r.status === "completed" ? <Badge variant="success">Completed</Badge> : r.status === "failed" ? <Badge variant="destructive">Failed</Badge> : <Badge variant="warning">In progress</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Requested by {r.requestedBy ?? "unknown"}</p>
                  {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
                  {r.status === "failed" && r.rolledBack && <p className="mt-1 text-xs text-muted-foreground">The database was left exactly as it was.</p>}
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No restores have been run.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {restoreFor && <RestoreDialog backup={restoreFor} onClose={() => setRestoreFor(null)} onQueued={refresh} />}
      {deleteFor && <PasswordDialog title="Delete this backup?" description={`The backup from ${fmtDate(deleteFor.startedAt)} will be removed from storage for good. The newest valid backup and the only valid backup cannot be deleted.`} confirmLabel="Delete backup" destructive onClose={() => setDeleteFor(null)} onConfirm={async (password) => { await apiFetch(`/platform/backups/${deleteFor.id}`, { method: "DELETE", body: { password } }); toast.success("Backup deleted"); void refresh(); }} />}
      {downloadFor && <PasswordDialog title="Download this backup?" description="The file is encrypted and cannot be read without the server's backup key. Keep it somewhere safe." confirmLabel="Download" onClose={() => setDownloadFor(null)} onConfirm={async (password) => { await downloadAuthenticatedFile(`/platform/backups/${downloadFor.id}/download`, "backup.ntsbk", { body: { password } }); }} />}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </p>
        <p className="text-base font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function PolicyCard({ policy, onSaved }: { policy: Overview["policy"]; onSaved: () => void }) {
  const [days, setDays] = React.useState(String(policy.retentionDays));
  const [keep, setKeep] = React.useState(String(policy.keepLatest));
  React.useEffect(() => {
    setDays(String(policy.retentionDays));
    setKeep(String(policy.keepLatest));
  }, [policy.retentionDays, policy.keepLatest]);
  const save = useMutation({
    mutationFn: () => apiFetch("/platform/backups/policy", { method: "PUT", body: { retentionDays: Number(days), keepLatest: Number(keep) } }),
    onSuccess: () => {
      toast.success("Retention policy saved");
      onSaved();
    },
    onError: (err) => toast.error(errorText(err, "Could not save the policy")),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Retention</CardTitle>
        <CardDescription>Old backups are removed automatically. The newest valid backups are always kept.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ret-days">Keep for (days)</Label>
            <Input id="ret-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ret-keep">Always keep the newest (at least 3)</Label>
            <Input id="ret-keep" type="number" min={3} max={365} value={keep} onChange={(e) => setKeep(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save policy
        </Button>
      </CardContent>
    </Card>
  );
}

/** Asks for the person's password, then runs `onConfirm`. Shows the server's reason if it is refused. */
function PasswordDialog(props: { title: string; description: string; confirmLabel: string; destructive?: boolean; onClose: () => void; onConfirm: (password: string) => Promise<void> }) {
  const [password, setPassword] = React.useState("");
  const run = useMutation({
    mutationFn: () => props.onConfirm(password),
    onSuccess: props.onClose,
    onError: (err) => toast.error(errorText(err, "That did not work")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="dlg-pw">Your password</Label>
          <PasswordInput id="dlg-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={run.isPending}>
            Cancel
          </Button>
          <Button variant={props.destructive ? "destructive" : "default"} disabled={!password || run.isPending} onClick={() => run.mutate()}>
            {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The restore, in steps: read what will happen, then confirm by typing the words, entering the password and ticking the box. */
function RestoreDialog({ backup, onClose, onQueued }: { backup: BackupItem; onClose: () => void; onQueued: () => void }) {
  const [step, setStep] = React.useState<"review" | "confirm" | "progress">("review");
  const [typed, setTyped] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const [restoreId, setRestoreId] = React.useState<string | null>(null);
  const preview = useQuery({ queryKey: ["platform-backups", "preview", backup.id], queryFn: () => apiFetch<Preview>(`/platform/backups/${backup.id}/restore-preview`), staleTime: 0 });
  const start = useMutation({
    mutationFn: () => apiFetch<RestoreItem>("/platform/backups/restores", { method: "POST", body: { backupId: backup.id, password, confirmation: typed, acknowledgeDataLoss: true } }),
    onSuccess: (r) => {
      setRestoreId(r.id);
      setStep("progress");
      onQueued();
    },
    onError: (err) => toast.error(errorText(err, "Could not start the restore")),
  });
  const p = preview.data;
  const finished = step !== "progress";
  return (
    <Dialog open onOpenChange={(open) => !open && finished && !start.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore the database</DialogTitle>
          <DialogDescription>Step {step === "review" ? "1" : step === "confirm" ? "2" : "3"} of 3</DialogDescription>
        </DialogHeader>

        {step === "review" && (
          <div className="space-y-3">
            {preview.isLoading ? (
              <Loading inline label="Checking the backup" />
            ) : preview.isError || !p ? (
              <p className="text-sm text-destructive">{errorText(preview.error, "Could not check this backup.")}</p>
            ) : (
              <>
                <div role="alert" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  <p>{p.warning}</p>
                </div>
                {p.problems.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                    {p.problems.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-muted-foreground">
                  Before anything changes the system saves a safety copy of the current data and checks it. If the restore fails it is undone completely. Everyone who is signed in may need to sign in again afterwards.
                </p>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!p?.canRestore} onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "confirm" && p && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rs-typed">
                Type <span className="font-mono font-semibold">{p.confirmationPhrase}</span> to confirm
              </Label>
              <Input id="rs-typed" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-pw">Your password</Label>
              <PasswordInput id="rs-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
              <span>I understand that data created after {fmtDate(backup.startedAt)} will be lost.</span>
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("review")} disabled={start.isPending}>
                Back
              </Button>
              <Button variant="destructive" disabled={!ack || !password || typed.trim().toUpperCase() !== p.confirmationPhrase || start.isPending} onClick={() => start.mutate()}>
                {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Restore the database
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "progress" && restoreId && (
          <div className="space-y-3">
            <RestoreProgress restoreId={restoreId} onDone={onQueued} bare />
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close (it keeps running)
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Follows a restore every few seconds. Safe to leave and come back to: the restore runs on the server. */
function RestoreProgress({ restoreId, onDone, bare }: { restoreId: string; onDone: () => void; bare?: boolean }) {
  const { data, isError, error } = useQuery({
    queryKey: ["platform-backups", "restore", restoreId],
    queryFn: () => apiFetch<RestoreItem>(`/platform/backups/restores/${restoreId}`),
    refetchInterval: (q) => (q.state.data && !q.state.data.active ? false : 3000),
    staleTime: 0,
  });
  const done = data && !data.active;
  React.useEffect(() => {
    if (done) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  const currentIndex = data ? STAGES.findIndex(([s]) => s === data.status) : 0;
  const body = (
    <div className="space-y-3" role="status" aria-live="polite">
      {isError && <p className="text-sm text-muted-foreground">Lost touch with the server ({errorText(error, "no answer")}). The restore keeps running; this will update when it is back.</p>}
      <ol className="space-y-2">
        {STAGES.map(([s, label], i) => {
          const failed = data?.status === "failed";
          const state = failed && i === Math.max(0, currentIndex) ? "failed" : data?.status === "completed" || i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
          return (
            <li key={s} className="flex items-center gap-2 text-sm">
              {state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> : state === "failed" ? <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border border-border" aria-hidden="true" />}
              <span className={state === "todo" ? "text-muted-foreground" : ""}>{label}</span>
            </li>
          );
        })}
      </ol>
      {data?.status === "completed" && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">The database has been restored. Sign in again if the page asks you to.</p>}
      {data?.status === "failed" && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">The restore did not complete.</p>
          <p className="text-muted-foreground">{data.error}</p>
          {data.rolledBack && <p className="mt-1">The database was left exactly as it was before.</p>}
        </div>
      )}
    </div>
  );
  if (bare) return body;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Restore in progress</CardTitle>
        <CardDescription>You can leave this page; the restore continues on the server.</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
