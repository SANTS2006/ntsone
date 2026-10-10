import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Eye, Pencil, ShieldCheck } from "lucide-react";
import { ShareLinkPanel } from "@/components/ShareLinkCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { createShare, shareKeys, updateShare, wishKeys, type ShareLevel, type WishShare, type Wishlist } from "./api";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export const LEVEL_TEXT: Record<ShareLevel, { title: string; short: string; text: string }> = {
  read: { title: "Can view", short: "Can view", text: "Sees the items, what was gotten, the summary and the activity, and can download the list. Cannot change anything." },
  write: { title: "Can edit", short: "Can edit", text: "Can also add items, change them, mark them as gotten, move them back and remove them. Cannot change the list itself, its budget, or who it is shared with." },
};

export const EXPIRY_CHOICES = [
  { value: "never", label: "Never expires", days: null },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
] as const;

/** A QR code for an address, drawn in the browser (nothing is sent anywhere to make it). */
export function useQrDataUrl(url: string | null | undefined) {
  return useQuery({
    queryKey: ["qr", url],
    queryFn: () => QRCode.toDataURL(url!, { margin: 1, width: 360, errorCorrectionLevel: "M" }),
    enabled: !!url,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    meta: { silent: true },
  }).data;
}

/** The private link for one person: copy it, share it on any app, or let them scan the QR code. */
export function ShareLinkDialog({ share, listName, onClose }: { share: WishShare; listName: string; onClose: () => void }) {
  const qr = useQrDataUrl(share.url);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link for {share.label}</DialogTitle>
          <DialogDescription>
            {LEVEL_TEXT[share.level].short}. They do not need an account: opening the link or scanning the code shows only this wish list.
          </DialogDescription>
        </DialogHeader>
        {share.url ? (
          <ShareLinkPanel url={share.url} qrCodeDataUrl={qr ?? null} shareText={`I shared my wish list "${listName}" with you`} qrFileName={`${listName}-${share.label}`} />
        ) : (
          <p className="text-sm text-muted-foreground">This invitation is not active, so there is no link.</p>
        )}
        <p className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Anyone who has this link can open the list. Send it only to {share.label}. If it gets passed on, press "New link" on the Sharing tab and the old one stops working.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LevelChoice({ value, onChange }: { value: ShareLevel; onChange: (v: ShareLevel) => void }) {
  return (
    <div role="radiogroup" aria-label="What they can do" className="grid gap-2 sm:grid-cols-2">
      {(["read", "write"] as const).map((level) => {
        const Icon = level === "read" ? Eye : Pencil;
        const on = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(level)}
            className={cn("flex flex-col gap-1 rounded-xl border p-3 text-left transition", on ? "border-primary bg-gradient-brand-soft shadow-sm" : "border-border/70 hover:border-primary/40")}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              {LEVEL_TEXT[level].title}
            </span>
            <span className="text-xs text-muted-foreground">{LEVEL_TEXT[level].text}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Invite someone: who, what they can do, how long. Then straight to their link and QR code. */
export function InviteDialog({ wishlist, onClose }: { wishlist: Wishlist; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [level, setLevel] = React.useState<ShareLevel>("read");
  const [expiry, setExpiry] = React.useState("never");
  const [sendEmail, setSendEmail] = React.useState(true);
  const [created, setCreated] = React.useState<WishShare | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      createShare(wishlist.id, {
        label: label.trim(),
        email: email.trim() || null,
        level,
        expiresInDays: EXPIRY_CHOICES.find((c) => c.value === expiry)?.days ?? null,
        sendEmail: Boolean(email.trim()) && sendEmail,
      }),
    onSuccess: (share) => {
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
      toast.success(share.emailed ? "Invitation created and emailed" : "Invitation created");
      setCreated(share);
    },
    onError: (err) => toast.error(errorText(err, "Could not create the invitation")),
  });

  if (created) return <ShareLinkDialog share={created} listName={wishlist.name} onClose={onClose} />;

  return (
    <Dialog open onOpenChange={(open) => !open && !invite.isPending && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share "{wishlist.name}"</DialogTitle>
          <DialogDescription>They get a private link and QR code. No account needed, and they can only see this one list.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return toast.error("Write who this is for, for example Mama");
            invite.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sh-label">Who is it for?</Label>
            <Input id="sh-label" autoFocus maxLength={80} placeholder="e.g. Mama, Fatmata, My husband" value={label} onChange={(e) => setLabel(e.target.value)} />
            <p className="text-xs text-muted-foreground">Only you see this name. It also shows next to what they change, in the activity.</p>
          </div>
          <div className="space-y-1.5">
            <Label>What can they do?</Label>
            <LevelChoice value={level} onChange={setLevel} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sh-email">Their email (optional)</Label>
              <Input id="sh-email" type="email" inputMode="email" autoComplete="off" maxLength={200} placeholder="To email them the link" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Link works for</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_CHOICES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {email.trim() && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
              Email them the link now
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending}>
              Create link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Change a person's name, what they can do, or when their link stops working. The link itself stays the same. */
export function EditShareDialog({ wishlistId, share, onClose }: { wishlistId: string; share: WishShare; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = React.useState(share.label);
  const [level, setLevel] = React.useState<ShareLevel>(share.level);
  const [expiry, setExpiry] = React.useState<string>("keep");
  const save = useMutation({
    mutationFn: () => {
      const choice = EXPIRY_CHOICES.find((c) => c.value === expiry);
      return updateShare(wishlistId, share.id, { label: label.trim(), level, ...(expiry !== "keep" ? { expiresInDays: choice?.days ?? null } : {}) });
    },
    onSuccess: () => {
      toast.success("Saved");
      void queryClient.invalidateQueries({ queryKey: shareKeys.shares(wishlistId) });
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
      onClose();
    },
    onError: (err) => toast.error(errorText(err, "Could not save")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Change access for {share.label}</DialogTitle>
          <DialogDescription>The change works at once, on the same link.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return toast.error("Write who this is for");
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="es-label">Name</Label>
            <Input id="es-label" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>What can they do?</Label>
            <LevelChoice value={level} onChange={setLevel} />
          </div>
          <div className="space-y-1.5">
            <Label>Link works for</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{share.expiresAt ? `Keep (until ${new Date(share.expiresAt).toLocaleDateString()})` : "Keep (never expires)"}</SelectItem>
                {EXPIRY_CHOICES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.value === "never" ? c.label : `${c.label} from now`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
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
