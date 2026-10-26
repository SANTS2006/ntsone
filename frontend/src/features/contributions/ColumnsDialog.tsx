import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { addColumn, contributionKeys, removeColumn, renameColumn, type Column } from "./api";

/** Add, rename or remove the columns of the table. The Amount column is automatic and cannot be changed. */
export function ColumnsDialog({ contributionId, columns, open, onOpenChange }: { contributionId: string; columns: Column[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; label: string } | null>(null);
  const [problem, setProblem] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setProblem("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: contributionKeys.one(contributionId) });
      if (done) toast.success(done);
      return true;
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "That did not work. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Columns of the table</DialogTitle>
          <DialogDescription>Add a column by typing its name. Removing a column hides it; what was typed in it is kept safe.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {columns.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border/70 p-2">
              {editing?.id === c.id ? (
                <>
                  <Input aria-label="Column name" value={editing.label} onChange={(e) => setEditing({ id: c.id, label: e.target.value })} maxLength={60} autoFocus />
                  <Button size="icon" variant="ghost" aria-label="Save the name" disabled={busy} onClick={async () => (await run(() => renameColumn(contributionId, c.id, editing.label.trim()), "Column renamed")) && setEditing(null)}>
                    <Check className="h-4 w-4 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                  <Button size="icon" variant="ghost" aria-label={`Rename ${c.label}`} onClick={() => setEditing({ id: c.id, label: c.label })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${c.label}`} disabled={busy || columns.length <= 1} onClick={() => run(() => removeColumn(contributionId, c.id), "Column removed")}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </li>
          ))}
          <li className="rounded-lg border border-dashed border-border p-2 text-sm text-muted-foreground">Amount (automatic)</li>
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!typed.trim()) return setProblem("Type the name of the new column first.");
            if (await run(() => addColumn(contributionId, typed.trim()), "Column added")) setTyped("");
          }}
        >
          <Input aria-label="New column name" placeholder="Type a new column name" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={60} />
          <Button type="submit" loading={busy}>
            Add
          </Button>
        </form>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
