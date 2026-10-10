import { Loading } from "@/components/Loading";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Mic, Trash2 } from "lucide-react";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { listVoiceNotes, removeVoiceNote, updateVoiceNote, type VoiceNote } from "./api";
import { useBooks } from "./BookkeepingLayout";
import { EntryDialog, type EntryDialogState } from "./EntryDialog";
import { KINDS, QUICK_KINDS } from "./kinds";
import { LoanDialog } from "./LoansPage";
import { PlayNote, VoiceCapture } from "./voice";

const when = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const length = (seconds: number | null) => (seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "");

/**
 * Voice notes are records: what someone said, kept as it was said. They can be listened to at any time, and turned
 * into an entry in the book (by the person or someone they trust) when there is time to write it down.
 */
export function VoicePage() {
  const { businessId, currency, canEdit } = useBooks();
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<"all" | "new" | "done">("all");
  const [page, setPage] = React.useState(1);
  const [choosing, setChoosing] = React.useState<VoiceNote | null>(null);
  const [entry, setEntry] = React.useState<EntryDialogState | null>(null);
  const [loan, setLoan] = React.useState<{ direction: "lent" | "borrowed"; noteId: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["books", businessId, "voice", status, page], queryFn: () => listVoiceNotes(businessId, { status, page, pageSize: 15 }), refetchInterval: 30_000 });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["books", businessId] });
  const remove = useMutation({
    mutationFn: (id: string) => removeVoiceNote(businessId, id),
    onSuccess: async () => {
      await refresh();
      toast.success("Voice note removed");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "That couldn't be removed"),
  });
  const markDone = useMutation({
    mutationFn: (id: string) => updateVoiceNote(businessId, id, { status: "done" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Marked as dealt with");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "That couldn't be changed"),
  });

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4 text-primary" /> Say it with your voice
            </CardTitle>
            <CardDescription>For anyone who finds writing hard: speak, and the recording is kept in your book as a record.</CardDescription>
          </CardHeader>
          <CardContent>
            <VoiceCapture businessId={businessId} onSaved={() => void refresh()} />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "new", "done"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            aria-pressed={status === s}
            className={cn("rounded-full border px-3 py-1.5 text-sm", status === s ? "border-primary bg-primary text-primary-foreground" : "border-border/70")}
          >
            {s === "all" ? "All" : s === "new" ? "Not written in the book yet" : "Written in the book"}
          </button>
        ))}
        <div className="ml-auto">
          <RefreshButton />
        </div>
      </div>

      {isLoading && <Loading label="Loading voice notes" />}
      {!isLoading && data?.items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No voice notes yet.</CardContent>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.items.map((note) => (
          <div key={note.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{when(note.createdAt)}</p>
                <p className="text-xs text-muted-foreground">{length(note.durationSeconds)}</p>
              </div>
              {note.status === "done" ? (
                <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="secondary">
                  <CheckCircle2 className="h-3 w-3" /> In the book
                </Badge>
              ) : (
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="secondary">
                  Not written yet
                </Badge>
              )}
            </div>
            <audio controls preload="none" src={note.audioUrl} className="w-full" />
            {(note.transcript || note.caption) && <p className="rounded-lg bg-muted/60 p-2 text-sm italic">&ldquo;{note.transcript ?? note.caption}&rdquo;</p>}
            {canEdit && note.status === "new" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setChoosing(note)}>
                  Write it in the book
                </Button>
                <Button size="sm" variant="outline" loading={markDone.isPending && markDone.variables === note.id} onClick={() => markDone.mutate(note.id)}>
                  Already dealt with
                </Button>
                <Button size="sm" variant="ghost" aria-label="Remove this voice note" loading={remove.isPending && remove.variables === note.id} onClick={() => remove.mutate(note.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <Dialog open={Boolean(choosing)} onOpenChange={(open) => !open && setChoosing(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>What was it about?</DialogTitle>
            <DialogDescription>Listen to the note, then choose what to write down. You can play it again inside the next step.</DialogDescription>
          </DialogHeader>
          {choosing && <PlayNote url={choosing.audioUrl} />}
          <div className="grid grid-cols-2 gap-2">
            {QUICK_KINDS.map((kind) => {
              const info = KINDS[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    setEntry({ kind, voiceNote: choosing! });
                    setChoosing(null);
                  }}
                  className={cn("flex items-center gap-2 rounded-xl bg-gradient-to-br p-3 text-left text-sm font-semibold text-white shadow", info.tone)}
                >
                  <info.icon className="h-5 w-5 shrink-0" />
                  {info.title}
                </button>
              );
            })}
            {(["lent", "borrowed"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => {
                  setLoan({ direction, noteId: choosing!.id });
                  setChoosing(null);
                }}
                className={cn("flex items-center gap-2 rounded-xl bg-gradient-to-br p-3 text-left text-sm font-semibold text-white shadow", direction === "lent" ? "from-blue-500 to-indigo-400" : "from-purple-500 to-pink-400")}
              >
                {direction === "lent" ? "I lent money" : "I borrowed money"}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <EntryDialog businessId={businessId} currency={currency} state={entry} onClose={() => setEntry(null)} />
      <LoanDialog businessId={businessId} currency={currency} direction={loan?.direction ?? null} voiceNoteId={loan?.noteId} onClose={() => setLoan(null)} />
    </div>
  );
}
