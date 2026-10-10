import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createEntry, updateEntry, type Entry, type EntryKind, type PayMethod, type VoiceNote } from "./api";
import { KINDS, METHODS, today } from "./kinds";
import { VoiceCapture } from "./voice";

export interface EntryDialogState {
  kind: EntryKind;
  /** Editing this entry (only the plain details can change). */
  entry?: Entry;
  /** Made from a voice note. */
  voiceNote?: VoiceNote;
}

/**
 * Writing something in the book, in as few steps as possible: how much, was it all paid, who with, what for.
 * Big buttons and plain words; the voice recorder is right there for anyone who would rather talk.
 */
export function EntryDialog({ businessId, currency, state, onClose }: { businessId: string; currency: string; state: EntryDialogState | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const info = state ? KINDS[state.kind] : null;
  const editing = Boolean(state?.entry);
  const [amount, setAmount] = React.useState("");
  const [onCredit, setOnCredit] = React.useState(false);
  const [paidNow, setPaidNow] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [party, setParty] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [method, setMethod] = React.useState<PayMethod>("cash");
  const [voice, setVoice] = React.useState<VoiceNote | null>(null);
  const [showVoice, setShowVoice] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    const e = state.entry;
    setAmount(e ? minorToInput(e.amountMinor) : "");
    setOnCredit(false);
    setPaidNow("");
    setDate(e?.entryDate ?? today());
    setParty(e?.partyName ?? "");
    setPhone(e?.partyPhone ?? "");
    setCategory(e?.category ?? "");
    setDetails(e?.description ?? state.voiceNote?.transcript ?? state.voiceNote?.caption ?? "");
    setMethod(e?.paymentMethod ?? "cash");
    setVoice(state.voiceNote ?? null);
    setShowVoice(false);
  }, [state]);

  const amountMinor = parseLeones(amount);
  const paidMinor = onCredit ? parseLeones(paidNow) : amountMinor;
  const validAmount = amountMinor !== null && amountMinor > 0;
  const validPaid = paidMinor !== null && validAmount && paidMinor >= 0 && paidMinor <= amountMinor!;
  const needsParty = onCredit && paidMinor !== null && amountMinor !== null && paidMinor < amountMinor;
  const ready = validAmount && validPaid && (!needsParty || party.trim().length >= 2) && Boolean(date);

  const save = useMutation({
    mutationFn: () => {
      if (state?.entry) {
        return updateEntry(businessId, state.entry.id, {
          entryDate: date,
          amountMinor: amountMinor!,
          category: category.trim() || null,
          description: details.trim() || null,
          partyName: party.trim() || null,
          partyPhone: phone.trim() || null,
          paymentMethod: method,
        });
      }
      return createEntry(businessId, {
        kind: state!.kind,
        entryDate: date,
        amountMinor: amountMinor!,
        paidMinor: onCredit ? paidMinor! : undefined,
        category: category.trim() || undefined,
        description: details.trim() || undefined,
        partyName: party.trim() || undefined,
        partyPhone: phone.trim() || undefined,
        paymentMethod: method,
        voiceNoteId: voice?.id,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["books", businessId] });
      toast.success(editing ? "Changed" : "Written in your book");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "It couldn't be saved. Please try again."),
  });

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overflow-x-hidden">
        {info && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white", info.tone)}>
                  <info.icon className="h-5 w-5" />
                </span>
                {editing ? `Change this ${info.label.toLowerCase()}` : info.title}
              </DialogTitle>
              <DialogDescription>{editing ? "Only the details can change. The kind of entry stays." : info.hint}</DialogDescription>
            </DialogHeader>

            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready) save.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="book-amount" className="text-base">
                  How much? ({currency === "SLE" ? "NLe" : currency})
                </Label>
                <Input id="book-amount" autoFocus inputMode="decimal" placeholder="0.00" className="h-14 text-2xl font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amount) && !validAmount ? true : undefined} />
                {amount && !validAmount && <p className="text-xs text-destructive">Enter an amount such as 450 or 450.50</p>}
              </div>

              {info.credit && !editing && (
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Was it all paid?">
                  {[
                    { value: false, title: info.moneyIn ? "Paid now" : "I paid now", sub: "All the money moved" },
                    { value: true, title: "On credit", sub: info.moneyIn ? "They pay later" : "I pay later" },
                  ].map((choice) => (
                    <button
                      key={String(choice.value)}
                      type="button"
                      onClick={() => setOnCredit(choice.value)}
                      aria-pressed={onCredit === choice.value}
                      className={cn("rounded-xl border-2 p-3 text-left transition-colors", onCredit === choice.value ? "border-primary bg-gradient-brand-soft" : "border-border/70 hover:border-primary/40")}
                    >
                      <span className="block font-semibold">{choice.title}</span>
                      <span className="block text-xs text-muted-foreground">{choice.sub}</span>
                    </button>
                  ))}
                </div>
              )}
              {onCredit && !editing && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="book-paid">How much {info.moneyIn ? "did they pay" : "did you pay"} now? (can be 0)</Label>
                  <Input id="book-paid" inputMode="decimal" placeholder="0" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} aria-invalid={Boolean(paidNow) && !validPaid ? true : undefined} />
                  {validAmount && validPaid && <p className="text-sm text-muted-foreground">Still to be paid: {formatMinor(amountMinor! - paidMinor!, currency)}</p>}
                  {Boolean(paidNow) && !validPaid && <p className="text-xs text-destructive">That is more than the total.</p>}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="book-party">
                    {info.partyLabel}
                    {needsParty ? "" : " (optional)"}
                  </Label>
                  <Input id="book-party" value={party} onChange={(e) => setParty(e.target.value)} maxLength={100} aria-invalid={needsParty && party.trim().length < 2 ? true : undefined} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="book-phone">Their phone (optional)</Label>
                  <Input id="book-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>What kind?</Label>
                <div className="flex flex-wrap gap-2">
                  {info.categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(category === c ? "" : c)}
                      aria-pressed={category === c}
                      className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", category === c ? "border-primary bg-primary text-primary-foreground" : "border-border/70 hover:border-primary/40")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <Input aria-label="Or write your own" placeholder="Or write your own" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="book-details">What was it for? (optional)</Label>
                <Input id="book-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={300} placeholder="For example: 3 bags of rice" />
              </div>

              <div className="flex flex-col gap-2">
                <Label>How was it paid?</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      aria-pressed={method === m.value}
                      className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-xs font-medium transition-colors", method === m.value ? "border-primary bg-gradient-brand-soft text-primary" : "border-border/70 hover:border-primary/40")}
                    >
                      <m.icon className="h-5 w-5" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="book-date">Date</Label>
                <Input id="book-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="w-44" />
              </div>

              {!editing && (
                <div className="flex flex-col gap-2">
                  {voice ? (
                    <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-300">
                      <Check className="h-4 w-4" /> A voice note is kept with this entry.
                    </p>
                  ) : showVoice ? (
                    <VoiceCapture
                      businessId={businessId}
                      compact
                      onSaved={(note, transcript) => {
                        setVoice(note);
                        setShowVoice(false);
                        if (transcript && !details.trim()) setDetails(transcript.slice(0, 300));
                      }}
                    />
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setShowVoice(true)} className="w-fit">
                      <Mic className="h-4 w-4" />
                      Add a voice note
                    </Button>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" size="lg" loading={save.isPending} disabled={!ready}>
                  {editing ? "Save changes" : "Write it in the book"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
