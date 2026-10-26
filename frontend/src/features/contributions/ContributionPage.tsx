import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CalendarRange, Lock, LockOpen, Pencil, Trash2, Zap } from "lucide-react";
import { Loading } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExportButtons } from "@/components/ExportButtons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { contributionKeys, getContribution, MONTH_NAMES, removeContribution, updateContribution, type ContributionDetail } from "./api";
import { ActivityTab, OverviewTab, WithdrawalsTab } from "./MoreTabs";
import { errorText, RecordsTable, useRefresh } from "./RecordsTable";
import { TrackerTab } from "./TrackerTab";

type TabKey = "overview" | "tracker" | "table" | "taken" | "activity";

/** One contribution: its table (or monthly tracker), money taken out, and history. */
export function ContributionPage() {
  const { contributionId = "" } = useParams<{ contributionId: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, error } = useQuery({ queryKey: contributionKeys.one(contributionId), queryFn: () => getContribution(contributionId), retry: false });
  const refresh = useRefresh(contributionId);
  const [editing, setEditing] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  usePageMeta({ title: data ? `${data.name} · Contributions` : "Contribution" });

  const toggle = useMutation({
    mutationFn: (status: "active" | "closed") => updateContribution(contributionId, { status }),
    onSuccess: async (_r, status) => {
      await refresh();
      toast.success(status === "closed" ? "Closed. Nothing can be changed until you reopen it." : "Reopened");
    },
    onError: (err) => toast.error(errorText(err, "That did not work. Check your connection and try again.")),
  });
  const remove = useMutation({
    mutationFn: () => removeContribution(contributionId),
    onSuccess: async () => {
      await refresh();
      toast.success("Contribution removed");
      navigate("/admin/contributions", { replace: true });
    },
    onError: (err) => toast.error(errorText(err, "The contribution could not be removed.")),
  });

  if (isLoading) return <Loading label="Loading the contribution" />;
  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "The contribution could not be loaded. Check your connection and refresh the page."}
        </p>
        <Button variant="outline" onClick={() => navigate("/admin/contributions")}>
          Back to contributions
        </Button>
      </div>
    );
  }

  const detail: ContributionDetail = data;
  const recurring = detail.kind === "recurring";
  const canEdit = detail.status === "active";
  const tabs: [TabKey, string][] = recurring
    ? [["overview", "Overview"], ["tracker", "Monthly tracker"], ["table", "Contributors"], ["taken", "Money taken"], ["activity", "History"]]
    : [["table", "Table"], ["taken", "Money taken"], ["activity", "History"]];
  const requested = params.get("tab") as TabKey | null;
  const tab: TabKey = requested && tabs.some(([key]) => key === requested) ? requested : tabs[0]![0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link to="/admin/contributions" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All contributions
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{detail.name}</h1>
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {recurring ? <CalendarRange className="h-3 w-3" aria-hidden="true" /> : <Zap className="h-3 w-3" aria-hidden="true" />}
                {recurring ? "Monthly" : "One-time"}
              </span>
              {detail.status === "closed" && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">Closed</span>}
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{detail.purpose}</p>
            {recurring && detail.startYear && detail.startMonth && (
              <p className="mt-1 text-xs text-muted-foreground">
                Started {MONTH_NAMES[detail.startMonth - 1]} {detail.startYear}
                {detail.expectedMonthlyMinor ? ` · ${formatMinor(detail.expectedMonthlyMinor)} expected each month` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit details
            </Button>
            <Button variant="outline" size="sm" loading={toggle.isPending} onClick={() => toggle.mutate(canEdit ? "closed" : "active")}>
              {canEdit ? <Lock className="h-4 w-4" aria-hidden="true" /> : <LockOpen className="h-4 w-4" aria-hidden="true" />}
              {canEdit ? "Close" : "Reopen"}
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setRemoving(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Collected</p><p className="mt-1 text-2xl font-bold">{formatMinor(detail.collectedMinor)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Taken out</p><p className="mt-1 text-2xl font-bold">{formatMinor(detail.takenMinor)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Still held</p><p className={cn("mt-1 text-2xl font-bold", detail.balanceMinor < 0 ? "text-destructive" : "gradient-text")}>{formatMinor(detail.balanceMinor)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/70 bg-card/60 p-1.5" role="tablist" aria-label="Sections">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setParams({ tab: key }, { replace: true })}
              className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition", tab === key ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:text-primary")}
            >
              {label}
            </button>
          ))}
        </div>
        <ExportButtons path={`/contributions/${detail.id}/export`} fileLabel={`Contribution ${detail.name}`} />
      </div>

      {tab === "overview" && <OverviewTab detail={detail} />}
      {tab === "tracker" && <TrackerTab detail={detail} canEdit={canEdit} />}
      {tab === "table" && <RecordsTable detail={detail} canEdit={canEdit} />}
      {tab === "taken" && <WithdrawalsTab detail={detail} canEdit={canEdit} />}
      {tab === "activity" && <ActivityTab detail={detail} />}

      <EditDialog detail={detail} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove "${detail.name}"?`}
        description="It disappears from your list. Everything in it is kept safe, but you will not be able to open it again here."
        confirmLabel="Remove contribution"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function EditDialog({ detail, open, onOpenChange }: { detail: ContributionDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefresh(detail.id);
  const [name, setName] = React.useState(detail.name);
  const [purpose, setPurpose] = React.useState(detail.purpose);
  const [expected, setExpected] = React.useState(minorToInput(detail.expectedMonthlyMinor ?? 0));
  const [problem, setProblem] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(detail.name);
      setPurpose(detail.purpose);
      setExpected(minorToInput(detail.expectedMonthlyMinor ?? 0));
      setProblem("");
    }
  }, [open, detail]);

  const save = useMutation({
    mutationFn: (input: Parameters<typeof updateContribution>[1]) => updateContribution(detail.id, input),
    onSuccess: async () => {
      await refresh();
      toast.success("Saved");
      onOpenChange(false);
    },
    onError: (err) => setProblem(errorText(err, "That could not be saved. Check your connection and try again.")),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Change the name, the purpose{detail.kind === "recurring" ? " or the monthly amount" : ""}.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return setProblem("Give the contribution a name (at least 2 characters).");
            if (purpose.trim().length < 2) return setProblem("Say what the money is for (at least 2 characters).");
            let expectedMinor: number | null | undefined;
            if (detail.kind === "recurring") {
              if (!expected.trim()) expectedMinor = null;
              else {
                const parsed = parseLeones(expected);
                if (parsed === null || parsed <= 0) return setProblem("Enter the monthly amount as a number, for example 50 or 12.50, or leave it empty.");
                expectedMinor = parsed;
              }
            }
            setProblem("");
            save.mutate({ name: name.trim(), purpose: purpose.trim(), ...(expectedMinor !== undefined ? { expectedMonthlyMinor: expectedMinor } : {}) });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-name">Name</Label>
            <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-purpose">Purpose</Label>
            <Input id="e-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={1000} />
          </div>
          {detail.kind === "recurring" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-expected">Monthly amount each person should pay (optional)</Label>
              <Input id="e-expected" inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="For example 50" />
            </div>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
