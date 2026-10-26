import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, HandCoins, Plus, X, Zap } from "lucide-react";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatMinor, parseLeones } from "@/lib/money";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { contributionKeys, createContribution, listContributions, MONTH_NAMES, type ContributionKind } from "./api";

/** Everything the keeper has collected, taken out, and still holds, across all their contributions. */
export function ContributionsListPage() {
  usePageMeta({ title: "Contributions" });
  const [creating, setCreating] = React.useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: contributionKeys.list(), queryFn: listContributions });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <HandCoins className="h-7 w-7 text-primary" aria-hidden="true" />
            Contributions
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Collect money from many people for a purpose and keep a clear record: who gave, how much and when, month by month for the ones that run for a long time, and what was taken out. Only you can see your contributions.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New contribution
        </Button>
      </div>

      {isLoading ? (
        <Loading label="Loading your contributions" />
      ) : isError || !data ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Your contributions could not be loaded. Check your connection and refresh the page.
        </p>
      ) : (
        <>
          {data.items.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Collected in all" value={formatMinor(data.totals.collectedMinor)} />
              <Stat label="Taken out in all" value={formatMinor(data.totals.takenMinor)} />
              <Stat label="Still held" value={formatMinor(data.totals.balanceMinor)} strong />
            </div>
          )}
          {data.items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <HandCoins className="h-10 w-10 text-primary" aria-hidden="true" />
                <p className="font-semibold">You have no contributions yet</p>
                <p className="max-w-md text-sm text-muted-foreground">Create one for a funeral, a wedding, a project or monthly dues. You choose the columns, and the amounts add up as you go.</p>
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create your first contribution
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((c) => (
                <Link key={c.id} to={`/admin/contributions/${c.id}`} className="group">
                  <Card className="h-full transition group-hover:border-primary/50 group-hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="min-w-0 break-words text-lg font-semibold leading-tight">{c.name}</h2>
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {c.kind === "recurring" ? <CalendarRange className="h-3 w-3" aria-hidden="true" /> : <Zap className="h-3 w-3" aria-hidden="true" />}
                          {c.kind === "recurring" ? "Monthly" : "One-time"}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{c.purpose}</p>
                      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Collected</dt>
                          <dd className="text-sm font-semibold">{formatMinor(c.collectedMinor)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Taken</dt>
                          <dd className="text-sm font-semibold">{formatMinor(c.takenMinor)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Held</dt>
                          <dd className="text-sm font-semibold text-primary">{formatMinor(c.balanceMinor)}</dd>
                        </div>
                      </dl>
                      <p className="text-xs text-muted-foreground">
                        {c.recordCount} {c.kind === "recurring" ? (c.recordCount === 1 ? "contributor" : "contributors") : c.recordCount === 1 ? "row" : "rows"}
                        {c.status === "closed" ? " · Closed" : ""}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <CreateContributionDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-xl font-bold", strong && "gradient-text")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function CreateContributionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const now = new Date();
  const [name, setName] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [kind, setKind] = React.useState<ContributionKind | null>(null);
  const [columns, setColumns] = React.useState<string[]>([]);
  const [typed, setTyped] = React.useState("");
  const [startMonth, setStartMonth] = React.useState(now.getMonth() + 1);
  const [startYear, setStartYear] = React.useState(String(now.getFullYear()));
  const [expected, setExpected] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const reset = () => {
    setName("");
    setPurpose("");
    setKind(null);
    setColumns([]);
    setTyped("");
    setExpected("");
    setErrors({});
  };

  const create = useMutation({
    mutationFn: createContribution,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: contributionKeys.all });
      toast.success("Contribution created");
      onOpenChange(false);
      reset();
      navigate(`/admin/contributions/${created.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The contribution could not be created. Check your connection and try again."),
  });

  const addColumn = () => {
    const label = typed.trim();
    if (!label) return setErrors((e) => ({ ...e, columns: "Type the name of a column, for example Name, then press Add." }));
    if (label.toLowerCase() === "amount") return setErrors((e) => ({ ...e, columns: "The Amount column is added for you. Type another column." }));
    if (columns.some((c) => c.toLowerCase() === label.toLowerCase())) return setErrors((e) => ({ ...e, columns: `You already added "${label}".` }));
    setColumns((c) => [...c, label]);
    setTyped("");
    setErrors((e) => ({ ...e, columns: "" }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Give the contribution a name (at least 2 characters).";
    if (purpose.trim().length < 2) next.purpose = "Say what the money is for (at least 2 characters).";
    if (!kind) next.kind = "Choose whether this is a one-time or a monthly contribution.";
    if (typed.trim()) next.columns = `Press Add to add the column "${typed.trim()}", or clear it.`;
    else if (columns.length === 0) next.columns = "Add at least one column, for example Name.";
    const expectedMinor = expected.trim() ? parseLeones(expected) : null;
    if (kind === "recurring" && expected.trim() && (expectedMinor === null || expectedMinor <= 0)) next.expected = "Enter the monthly amount as a number, for example 50 or 12.50.";
    const year = Number(startYear);
    if (kind === "recurring" && (!Number.isInteger(year) || year < 2000 || year > 2200)) next.start = "Enter a year between 2000 and 2200.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    create.mutate({
      name: name.trim(),
      purpose: purpose.trim(),
      kind: kind!,
      fields: columns,
      ...(kind === "recurring" ? { startYear: year, startMonth, expectedMonthlyMinor: expectedMinor } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New contribution</DialogTitle>
          <DialogDescription>Name it, say what it is for, and choose how it runs. You can change the details later.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field id="c-name" label="Name" error={errors.name}>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Kamara family funeral" maxLength={120} autoFocus />
          </Field>
          <Field id="c-purpose" label="Purpose" error={errors.purpose}>
            <Input id="c-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What is the money for?" maxLength={1000} />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">How does it run?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["one_time", "One time", "People give once. You list each person and what they gave.", Zap],
                  ["recurring", "Monthly, for months or years", "The same people pay every month. Track who paid and who did not.", CalendarRange],
                ] as const
              ).map(([value, title, text, Icon]) => (
                <label key={value} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition", kind === value ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40")}>
                  <input type="radio" name="kind" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={kind === value} onChange={() => setKind(value)} />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      {title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.kind && <p role="alert" className="text-sm text-destructive">{errors.kind}</p>}
          </fieldset>

          {kind === "recurring" && (
            <div className="grid gap-3 rounded-xl border border-border/70 p-3 sm:grid-cols-3">
              <Field id="c-month" label="Starts in" error={errors.start}>
                <select id="c-month" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="c-year" label="Year">
                <Input id="c-year" inputMode="numeric" value={startYear} onChange={(e) => setStartYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </Field>
              <Field id="c-expected" label="Monthly amount (optional)" error={errors.expected}>
                <Input id="c-expected" inputMode="decimal" placeholder="For example 50" value={expected} onChange={(e) => setExpected(e.target.value)} />
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-column">Columns of your table</Label>
            <p className="text-xs text-muted-foreground">Type each column you want (for example Name, Gender, Phone) and press Add. The Amount column is always there.</p>
            <div className="flex gap-2">
              <Input
                id="c-column"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addColumn();
                  }
                }}
                placeholder="Type a column name"
                maxLength={60}
              />
              <Button type="button" variant="outline" onClick={addColumn}>
                Add
              </Button>
            </div>
            <ul className="flex flex-wrap gap-2" aria-label="Your columns">
              {columns.map((c) => (
                <li key={c} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-1 pl-3 pr-1 text-sm">
                  {c}
                  <button type="button" aria-label={`Remove the column ${c}`} className="rounded-full p-1 text-muted-foreground hover:text-destructive" onClick={() => setColumns((list) => list.filter((x) => x !== c))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              <li className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground">{kind === "recurring" ? "Months are added automatically" : "Amount (automatic)"}</li>
            </ul>
            {errors.columns && <p role="alert" className="text-sm text-destructive">{errors.columns}</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create contribution
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
