import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, Lock, LockOpen, Settings2, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ShareLinkCard, ShareLinkPanel } from "@/components/ShareLinkCard";
import { StatCard } from "@/components/StatCard";
import { ApiError } from "@/lib/api";
import { ImagePickerField } from "../idcards/IdCardSettingsCard";
import { closePoll, deletePoll, openPoll, uploadPollImage, type Poll } from "./api";
import { useInvalidatePolls, usePollResults, usePollShareInfo, useUpdatePoll } from "./hooks";
import { useAuth } from "@/app/AuthContext";
import { MembersCard } from "../access/MembersCard";
import { usePollOutletContext } from "./PollDetailLayout";
import { VerifiedVotersCard } from "./VerifiedVotersCard";
import { PollPaymentSettingsCard } from "../payments/PollPaymentSettingsCard";

/** "2026-10-01T18:00" in the viewer's own time zone, for a datetime-local input. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

function StatusCard({ poll, canEdit }: { poll: Poll; canEdit: boolean }) {
  const invalidate = useInvalidatePolls();
  const updatePoll = useUpdatePoll(poll.id);
  const [busy, setBusy] = React.useState(false);
  const [closesAt, setClosesAt] = React.useState(toLocalInput(poll.closesAt));
  React.useEffect(() => setClosesAt(toLocalInput(poll.closesAt)), [poll.closesAt]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      await invalidate();
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const saveClosingTime = () => {
    const value = closesAt ? new Date(closesAt) : null;
    if (value && value <= new Date()) return toast.error("Pick a closing time in the future");
    void run(() => updatePoll.mutateAsync({ closesAt: value ? value.toISOString() : null }), value ? "Closing time saved" : "Closing time removed");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Voting</CardTitle>
        <CardDescription>
          {poll.state === "open" && "Voting is open. People with the link can sign in and vote."}
          {poll.state === "draft" && "Voting hasn't opened yet. Build the ballot, then open voting."}
          {poll.state === "closed" && "Voting is closed. People who open the link see that voting has closed."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {poll.state === "open" ? (
              <Button variant="outline" loading={busy} onClick={() => run(() => closePoll(poll.id), "Voting closed")}>
                <Lock className="h-4 w-4" />
                Close voting now
              </Button>
            ) : (
              <Button loading={busy} onClick={() => run(() => openPoll(poll.id), "Voting is open")}>
                <LockOpen className="h-4 w-4" />
                {poll.state === "closed" ? "Reopen voting" : "Open voting"}
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="closesAt" className="flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
            Close automatically at
          </Label>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Input id="closesAt" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="w-auto" />
              <Button variant="outline" onClick={saveClosingTime} disabled={busy}>
                Save
              </Button>
              {poll.closesAt && (
                <Button variant="ghost" onClick={() => { setClosesAt(""); void run(() => updatePoll.mutateAsync({ closesAt: null }), "Closing time removed"); }} disabled={busy}>
                  Remove
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm">{poll.closesAt ? formatWhen(poll.closesAt) : "No closing time set"}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {poll.closesAt
              ? `Voting ${new Date(poll.closesAt) <= new Date() ? "closed" : "closes"} on ${formatWhen(poll.closesAt)}.`
              : "Leave empty to keep voting open until you close it."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsCard({ poll, canEdit }: { poll: Poll; canEdit: boolean }) {
  const updatePoll = useUpdatePoll(poll.id);
  const [draft, setDraft] = React.useState(poll);
  const [uploading, setUploading] = React.useState(false);
  React.useEffect(() => setDraft(poll), [poll]);
  const set = (patch: Partial<Poll>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (draft.restrictEmailDomain && !draft.allowedEmailDomains?.trim()) return toast.error("Enter the email domain voters must use");
    try {
      await updatePoll.mutateAsync({
        name: draft.name,
        description: draft.description,
        imageUrl: draft.imageUrl,
        onePerEmail: draft.onePerEmail,
        restrictEmailDomain: draft.restrictEmailDomain,
        allowedEmailDomains: draft.allowedEmailDomains,
        showResults: draft.showResults,
        notifyOnVote: draft.notifyOnVote,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      set({ imageUrl: await uploadPollImage(poll.id, file) });
      toast.success("Image uploaded. Remember to save.");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const toggles: { key: "onePerEmail" | "showResults" | "notifyOnVote"; label: string; on: string; off: string }[] = [
    {
      key: "onePerEmail",
      label: "One vote per email",
      on: "Each email address can vote once for each position. A second attempt is refused with a voting failed message.",
      off: "The same email address can vote more than once.",
    },
    {
      key: "showResults",
      label: "Show live results to voters",
      on: "Voters see each candidate's percentage and place, updated live.",
      off: "Only your team sees the results.",
    },
    {
      key: "notifyOnVote",
      label: "Email the team about each vote",
      on: "The poll's admins and viewers get an email for every vote. Large polls send many emails.",
      off: "No email is sent when someone votes.",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-primary" aria-hidden="true" />
          Settings
        </CardTitle>
        <CardDescription>The name and picture also appear on the poll&apos;s own sign-in pages.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="poll-name">Name</Label>
            <Input id="poll-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="poll-description">Description</Label>
            <Textarea id="poll-description" rows={3} value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} />
          </div>
          {canEdit && (
            <ImagePickerField
              label="Logo or picture"
              hint="Shown on the voting pages and the voter sign-in and sign-up pages."
              value={draft.imageUrl ?? undefined}
              uploading={uploading}
              onUpload={(file) => void upload(file)}
              onRemove={() => set({ imageUrl: null })}
            />
          )}

          {toggles.map((t) => (
            <div key={t.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
              <div>
                <Label htmlFor={t.key} className="font-medium">
                  {t.label}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">{draft[t.key] ? t.on : t.off}</p>
              </div>
              <Switch id={t.key} checked={draft[t.key]} onCheckedChange={(checked) => set({ [t.key]: checked })} />
            </div>
          ))}

          <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="restrictEmailDomain" className="font-medium">
                  Only allow certain email domains
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {draft.restrictEmailDomain
                    ? "Only voters whose email ends in one of these domains can vote. Everyone else is told they can't vote with that email."
                    : "Anyone with an email address can vote."}
                </p>
              </div>
              <Switch
                id="restrictEmailDomain"
                checked={draft.restrictEmailDomain}
                onCheckedChange={(checked) => set({ restrictEmailDomain: checked })}
              />
            </div>
            {draft.restrictEmailDomain && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="allowedEmailDomains">Allowed email domains</Label>
                <Input
                  id="allowedEmailDomains"
                  placeholder="e.g. university.edu, staff.university.edu"
                  value={draft.allowedEmailDomains ?? ""}
                  onChange={(e) => set({ allowedEmailDomains: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Separate several domains with commas.</p>
              </div>
            )}
          </div>
        </fieldset>
        {canEdit && (
          <Button onClick={save} loading={updatePoll.isPending} className="self-start">
            Save settings
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ShareSection({ poll }: { poll: Poll }) {
  const { data } = usePollShareInfo(poll.id);
  const [openPosition, setOpenPosition] = React.useState<string | null>(null);
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6">
      <ShareLinkCard
        title="Share the whole poll"
        description="Voters go through every position one after another, and can skip a position or exit at any time."
        url={data.poll.url}
        qrCodeDataUrl={data.poll.qrCodeDataUrl}
        shareText={`Vote in ${poll.name}`}
        qrFileName={`${poll.name}-poll`}
      />
      {data.positions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Share one position
            </CardTitle>
            <CardDescription>
              Each position has its own link. After voting, people are asked if they want to go on to the other positions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.positions.map((position) => (
              <div key={position.id} className="rounded-lg border border-border/70">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-medium"
                  aria-expanded={openPosition === position.id}
                  onClick={() => setOpenPosition((id) => (id === position.id ? null : position.id))}
                >
                  {position.title}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openPosition === position.id ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {openPosition === position.id && (
                  <div className="border-t border-border/70 p-3">
                    <ShareLinkPanel
                      url={position.url}
                      qrCodeDataUrl={position.qrCodeDataUrl}
                      shareText={`Vote for ${position.title} in ${poll.name}`}
                      qrFileName={`${poll.name}-${position.title}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeletePollCard({ poll }: { poll: Poll }) {
  const navigate = useNavigate();
  const invalidate = useInvalidatePolls();
  const [deleting, setDeleting] = React.useState(false);
  const remove = async () => {
    setDeleting(true);
    try {
      await deletePoll(poll.id);
      await invalidate();
      toast.success("Poll deleted");
      navigate("/admin/polls");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete the poll");
      setDeleting(false);
    }
  };
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Delete poll</CardTitle>
        <CardDescription>Removes the poll, its voting links, and its results.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4" />
              Delete poll
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {poll.name}?</DialogTitle>
              <DialogDescription>The voting links stop working and the results are no longer available.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" loading={deleting} onClick={remove}>
                Delete poll
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function PollOverviewPage() {
  const { poll } = usePollOutletContext();
  const canEdit = poll.myRole === "admin";
  const { user } = useAuth();
  const { data: results } = usePollResults(poll.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Positions" value={results?.positions.length ?? 0} />
        <StatCard label="Voters signed up" value={results?.registeredVoters ?? 0} />
        <StatCard label="People who voted" value={results?.voters ?? 0} />
        <StatCard label="Votes cast" value={results?.votes ?? 0} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <StatusCard poll={poll} canEdit={canEdit} />
          <ShareSection poll={poll} />
        </div>
        <div className="flex flex-col gap-6">
          <SettingsCard poll={poll} canEdit={canEdit} />
          <PollPaymentSettingsCard poll={poll} canEdit={canEdit} />
          <VerifiedVotersCard poll={poll} canEdit={canEdit} />
          {canEdit && user && <MembersCard kind="polls" id={poll.id} currentUserId={user.id} />}
          {canEdit && <DeletePollCard poll={poll} />}
        </div>
      </div>
    </div>
  );
}
