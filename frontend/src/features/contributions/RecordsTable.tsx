import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { Loading } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import {
  addRecord,
  contributionKeys,
  listRecords,
  MONTH_NAMES,
  removeRecord,
  stamp,
  updateRecord,
  type Column,
  type ContributionDetail,
  type RecordRow,
} from "./api";
import { ColumnsDialog } from "./ColumnsDialog";

/** What went wrong, in the server's own words when it said (and for the box it is about). */
export const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return React.useCallback(() => queryClient.invalidateQueries({ queryKey: contributionKeys.one(id) }).then(() => queryClient.invalidateQueries({ queryKey: contributionKeys.list() })), [id, queryClient]);
}

type Draft = { values: Record<string, string>; amount: string; startMonth: number; startYear: string };
const emptyDraft = (detail: ContributionDetail): Draft => ({ values: {}, amount: "", startMonth: detail.startMonth ?? 1, startYear: String(detail.startYear ?? new Date().getFullYear()) });

/**
 * The table itself. One-time: a row per person with the amount they gave, a running total, and the date and time each row was
 * entered and last changed. Recurring: the contributors (their monthly payments are on the tracker).
 */
export function RecordsTable({ detail, canEdit }: { detail: ContributionDetail; canEdit: boolean }) {
  const recurring = detail.kind === "recurring";
  const refresh = useRefresh(detail.id);
  const { data, isLoading, isError } = useQuery({ queryKey: contributionKeys.records(detail.id), queryFn: () => listRecords(detail.id) });
  const [search, setSearch] = React.useState("");
  const [draft, setDraft] = React.useState<Draft>(() => emptyDraft(detail));
  const [problem, setProblem] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; draft: Draft } | null>(null);
  const [removing, setRemoving] = React.useState<RecordRow | null>(null);
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const firstInput = React.useRef<HTMLInputElement>(null);

  const fields = data?.fields ?? detail.fields;

  const build = (d: Draft, forEdit: boolean) => {
    const values: Record<string, string> = {};
    for (const f of fields) if (d.values[f.id]?.trim()) values[f.id] = d.values[f.id]!.trim();
    if (Object.keys(values).length === 0) return { error: "Fill in at least one column before saving the row." } as const;
    if (recurring) {
      const year = Number(d.startYear);
      if (!Number.isInteger(year) || year < 2000 || year > 2200) return { error: "Enter a year between 2000 and 2200 for when this person starts paying." } as const;
      return { input: { values, startYear: year, startMonth: d.startMonth } } as const;
    }
    const amountMinor = parseLeones(d.amount);
    if (!d.amount.trim() && !forEdit) return { error: "Enter the amount this person gave." } as const;
    if (amountMinor === null || amountMinor <= 0) return { error: "Enter the amount as a number more than zero, for example 50 or 12.50." } as const;
    return { input: { values, amountMinor } } as const;
  };

  const add = useMutation({
    mutationFn: (input: Parameters<typeof addRecord>[1]) => addRecord(detail.id, input),
    onSuccess: async () => {
      await refresh();
      setDraft(emptyDraft(detail));
      setProblem("");
      firstInput.current?.focus();
    },
    onError: (err) => setProblem(errorText(err, "The row could not be saved. Check your connection and try again.")),
  });
  const save = useMutation({
    mutationFn: (args: { id: string; input: Parameters<typeof updateRecord>[2] }) => updateRecord(detail.id, args.id, args.input),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      setProblem("");
      toast.success("Row saved");
    },
    onError: (err) => setProblem(errorText(err, "The row could not be saved. Check your connection and try again.")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeRecord(detail.id, id),
    onSuccess: async () => {
      await refresh();
      setRemoving(null);
      toast.success("Row removed");
    },
    onError: (err) => toast.error(errorText(err, "The row could not be removed.")),
  });

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) return setProblem("Save or cancel the row you are editing first.");
    const built = build(draft, false);
    if ("error" in built) return setProblem(built.error ?? "");
    setProblem("");
    add.mutate(built.input);
  };

  const rows = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = data?.items ?? [];
    if (!term) return all;
    return all.filter((r) => Object.values(r.values).some((v) => v.toLowerCase().includes(term)));
  }, [data, search]);
  const shownTotal = rows.reduce((s, r) => s + (r.amountMinor ?? 0), 0);

  if (isLoading) return <Loading label="Loading the table" />;
  if (isError || !data) return <p role="alert" className="text-sm text-destructive">The table could not be loaded. Check your connection and refresh the page.</p>;

  const cellInputs = (d: Draft, set: (next: Draft) => void, first?: React.Ref<HTMLInputElement>) =>
    fields.map((f, i) => (
      <TableCell key={f.id} className="min-w-[8rem]">
        <Input
          ref={i === 0 ? first : undefined}
          aria-label={f.label}
          placeholder={f.label}
          value={d.values[f.id] ?? ""}
          maxLength={500}
          onChange={(e) => set({ ...d, values: { ...d.values, [f.id]: e.target.value } })}
        />
      </TableCell>
    ));

  const startInputs = (d: Draft, set: (next: Draft) => void) => (
    <TableCell className="min-w-[11rem]">
      <div className="flex gap-1.5">
        <select aria-label="Month this person starts paying" className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={d.startMonth} onChange={(e) => set({ ...d, startMonth: Number(e.target.value) })}>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m.slice(0, 3)}
            </option>
          ))}
        </select>
        <Input aria-label="Year this person starts paying" className="w-20" inputMode="numeric" value={d.startYear} onChange={(e) => set({ ...d, startYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
      </div>
    </TableCell>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label="Search the table" placeholder="Search the table..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setColumnsOpen(true)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Edit columns
          </Button>
        )}
      </div>

      {problem && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {problem}
        </p>
      )}

      <form onSubmit={submitAdd} className="overflow-x-auto rounded-xl border border-border/70 bg-card/60">
        <Table>
          <TableHeader className="bg-gradient-brand-soft">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">#</TableHead>
              {fields.map((f) => (
                <TableHead key={f.id} className="font-semibold">
                  {f.label}
                </TableHead>
              ))}
              {recurring ? (
                <>
                  <TableHead className="font-semibold">Starts paying</TableHead>
                  <TableHead className="text-right font-semibold">Months paid</TableHead>
                  <TableHead className="text-right font-semibold">Total paid</TableHead>
                </>
              ) : (
                <TableHead className="text-right font-semibold">Amount</TableHead>
              )}
              <TableHead className="font-semibold">Entered</TableHead>
              <TableHead className="font-semibold">Last changed</TableHead>
              {canEdit && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={fields.length + (recurring ? 6 : 4) + (canEdit ? 1 : 0)} className="py-8 text-center text-muted-foreground">
                  {search ? "No row matches your search." : recurring ? "No contributors yet. Add the first one below." : "No rows yet. Fill in the row below and press Add to start."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, index) =>
              editing?.id === r.id ? (
                <TableRow key={r.id} className="bg-primary/5">
                  <TableCell>{index + 1}</TableCell>
                  {cellInputs(editing.draft, (next) => setEditing({ id: r.id, draft: next }))}
                  {recurring ? (
                    <>
                      {startInputs(editing.draft, (next) => setEditing({ id: r.id, draft: next }))}
                      <TableCell className="text-right">{r.monthsPaid}</TableCell>
                      <TableCell className="text-right">{formatMinor(r.amountMinor ?? 0)}</TableCell>
                    </>
                  ) : (
                    <TableCell className="min-w-[8rem]">
                      <Input aria-label="Amount" inputMode="decimal" className="text-right" value={editing.draft.amount} onChange={(e) => setEditing({ id: r.id, draft: { ...editing.draft, amount: e.target.value } })} />
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{stamp(r.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{stamp(r.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Save this row"
                        loading={save.isPending}
                        onClick={() => {
                          const built = build(editing.draft, true);
                          if ("error" in built) return setProblem(built.error ?? "");
                          setProblem("");
                          save.mutate({ id: r.id, input: built.input });
                        }}
                      >
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Cancel editing" onClick={() => (setEditing(null), setProblem(""))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  {fields.map((f) => (
                    <TableCell key={f.id}>{r.values[f.id] ?? ""}</TableCell>
                  ))}
                  {recurring ? (
                    <>
                      <TableCell className="whitespace-nowrap">{r.startMonth && r.startYear ? `${MONTH_NAMES[r.startMonth - 1]!.slice(0, 3)} ${r.startYear}` : ""}</TableCell>
                      <TableCell className="text-right">
                        {r.monthsPaid}
                        {r.monthsDue !== null ? <span className="text-muted-foreground"> / {r.monthsDue}</span> : null}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatMinor(r.amountMinor ?? 0)}</TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right font-medium">{formatMinor(r.amountMinor ?? 0)}</TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{stamp(r.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.updatedAt !== r.createdAt ? stamp(r.updatedAt) : "Not changed"}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Edit this row"
                          onClick={() =>
                            setEditing({
                              id: r.id,
                              draft: { values: { ...r.values }, amount: minorToInput(r.amountMinor ?? 0), startMonth: r.startMonth ?? 1, startYear: String(r.startYear ?? new Date().getFullYear()) },
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Remove this row" onClick={() => setRemoving(r)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ),
            )}
            {canEdit && (
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell>
                  <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
                </TableCell>
                {cellInputs(draft, setDraft, firstInput)}
                {recurring ? (
                  <>
                    {startInputs(draft, setDraft)}
                    <TableCell />
                    <TableCell />
                  </>
                ) : (
                  <TableCell className="min-w-[8rem]">
                    <Input aria-label="Amount" placeholder="Amount" inputMode="decimal" className="text-right" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
                  </TableCell>
                )}
                <TableCell colSpan={2} className="text-xs text-muted-foreground">
                  The date and time are saved for you
                </TableCell>
                <TableCell>
                  <Button type="submit" size="sm" loading={add.isPending}>
                    Add
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {!recurring && (
            <tfoot>
              <TableRow className="bg-gradient-brand-soft font-semibold hover:bg-gradient-brand-soft">
                <TableCell colSpan={fields.length + 1}>
                  Total ({rows.length} {rows.length === 1 ? "row" : "rows"}
                  {search ? ", matching your search" : ""})
                </TableCell>
                <TableCell className="text-right text-base">{formatMinor(search ? shownTotal : data.totalMinor)}</TableCell>
                <TableCell colSpan={canEdit ? 3 : 2} />
              </TableRow>
            </tfoot>
          )}
        </Table>
      </form>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this row?"
        description={recurring ? "This contributor, and the payments recorded for them, will no longer count. The change is kept in the activity history." : "Its amount will no longer count in the total. The change is kept in the activity history."}
        confirmLabel="Remove row"
        busy={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
      />
      <ColumnsDialog contributionId={detail.id} columns={fields as Column[]} open={columnsOpen} onOpenChange={setColumnsOpen} />
    </div>
  );
}
