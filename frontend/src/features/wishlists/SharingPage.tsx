import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, KeyRound, Link2, Mail, Pencil, QrCode, RefreshCw, Share2, UserMinus, UserPlus } from "lucide-react";
import { Loading } from "@/components/Loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { emailShare, listShares, resetShare, revokeShare, shareKeys, wishKeys, type WishShare } from "./api";
import { ConfirmDialog } from "./dialogs";
import { EditShareDialog, InviteDialog, LEVEL_TEXT, ShareLinkDialog } from "./sharing";
import { EmptyState } from "./ui";
import { useWishlistContext } from "./WishlistLayout";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function StatusBadge({ share }: { share: WishShare }) {
  if (share.status === "revoked") return <Badge variant="secondary">Removed</Badge>;
  if (share.status === "expired") return <Badge variant="warning">Expired</Badge>;
  return <Badge variant="success">Active</Badge>;
}

/** Who this list is shared with: each person's link and QR code, what they can do, and when they last looked. Owner only. */
export function SharingPage() {
  const { wishlist } = useWishlistContext();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: shareKeys.shares(wishlist.id), queryFn: () => listShares(wishlist.id) });
  const [inviting, setInviting] = React.useState(false);
  const [linkFor, setLinkFor] = React.useState<WishShare | null>(null);
  const [editing, setEditing] = React.useState<WishShare | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "revoke" | "reset"; share: WishShare } | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: shareKeys.shares(wishlist.id) });
    void queryClient.invalidateQueries({ queryKey: wishKeys.all });
  };
  const act = useMutation({
    mutationFn: async ({ kind, share }: { kind: "revoke" | "reset"; share: WishShare }) => (kind === "revoke" ? revokeShare(wishlist.id, share.id) : resetShare(wishlist.id, share.id)),
    onSuccess: (result, { kind }) => {
      setConfirm(null);
      refresh();
      if (kind === "reset") {
        toast.success("A new link was made. The old one no longer works.");
        setLinkFor(result);
      } else toast.success("Access removed");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "That did not work"),
  });
  const email = useMutation({
    mutationFn: (share: WishShare) => emailShare(wishlist.id, share.id),
    onSuccess: () => {
      toast.success("Invitation emailed");
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not send the email"),
  });

  const active = (data ?? []).filter((s) => s.status === "active");
  const others = (data ?? []).filter((s) => s.status !== "active");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Share2 className="h-5 w-5 text-primary" aria-hidden="true" />
            Share this list
          </h2>
          <p className="text-sm text-muted-foreground">
            Invite family, friends or a partner. Each person gets their own private link and QR code and sees <strong>only this list</strong>, with the access you choose. They do not need an account and cannot reach anything else.
          </p>
        </div>
        <Button onClick={() => setInviting(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Invite someone
        </Button>
      </div>

      {isLoading ? (
        <Loading label="Loading who has access" />
      ) : isError || !data ? (
        <EmptyState title="Could not load the invitations.">
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </EmptyState>
      ) : data.length === 0 ? (
        <EmptyState title="This list is not shared with anyone.">
          <p>Press Invite someone to make a link and QR code for them. You choose whether they can only look, or add and change items too.</p>
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-3">
            {active.map((share) => (
              <ShareRow key={share.id} share={share} onLink={() => setLinkFor(share)} onEdit={() => setEditing(share)} onReset={() => setConfirm({ kind: "reset", share })} onRevoke={() => setConfirm({ kind: "revoke", share })} onEmail={() => email.mutate(share)} emailing={email.isPending && email.variables?.id === share.id} />
            ))}
          </ul>
          {others.length > 0 && (
            <details className="rounded-xl border border-border/70 p-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Expired and removed ({others.length})</summary>
              <ul className="mt-3 grid gap-3">
                {others.map((share) => (
                  <ShareRow key={share.id} share={share} onLink={() => setLinkFor(share)} onEdit={() => setEditing(share)} onReset={() => undefined} onRevoke={() => undefined} onEmail={() => undefined} emailing={false} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {inviting && (
        <InviteDialog
          wishlist={wishlist}
          onClose={() => {
            setInviting(false);
            refresh();
          }}
        />
      )}
      {linkFor && <ShareLinkDialog share={linkFor} listName={wishlist.name} onClose={() => setLinkFor(null)} />}
      {editing && <EditShareDialog wishlistId={wishlist.id} share={editing} onClose={() => setEditing(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "revoke" ? `Remove ${confirm.share.label}'s access?` : `Make a new link for ${confirm.share.label}?`}
          description={
            confirm.kind === "revoke"
              ? "Their link and QR code stop working at once. What they added or changed stays on the list and in the activity."
              : "Their old link and QR code stop working at once. You will get a new link to send them. Their access stays the same."
          }
          confirmLabel={confirm.kind === "revoke" ? "Remove access" : "Make a new link"}
          destructive={confirm.kind === "revoke"}
          busy={act.isPending}
          onConfirm={() => act.mutate(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function ShareRow({ share, onLink, onEdit, onReset, onRevoke, onEmail, emailing }: { share: WishShare; onLink: () => void; onEdit: () => void; onReset: () => void; onRevoke: () => void; onEmail: () => void; emailing: boolean }) {
  const active = share.status === "active";
  const LevelIcon = share.level === "write" ? Pencil : Eye;
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="break-words font-semibold">{share.label}</span>
              <StatusBadge share={share} />
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={LEVEL_TEXT[share.level].text}>
                <LevelIcon className="h-3 w-3" aria-hidden="true" />
                {LEVEL_TEXT[share.level].short}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {share.accessCount === 0 ? "Not opened yet" : `Opened ${share.accessCount} time${share.accessCount === 1 ? "" : "s"}, last ${ago(share.lastAccessedAt)}`}
              {share.expiresAt && ` · ${share.status === "expired" ? "expired" : "expires"} ${new Date(share.expiresAt).toLocaleDateString()}`}
              {share.email && ` · ${share.email}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {active && (
              <Button size="sm" onClick={onLink}>
                <QrCode className="h-4 w-4" aria-hidden="true" />
                Link and QR
              </Button>
            )}
            {share.status !== "revoked" && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Access
              </Button>
            )}
            {active && share.email && (
              <Button size="icon" variant="ghost" aria-label={`Email the link to ${share.label} again`} title="Email the link again" loading={emailing} onClick={onEmail}>
                <Mail className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {active && (
              <Button size="icon" variant="ghost" aria-label={`Make a new link for ${share.label}`} title="New link (the old one stops working)" onClick={onReset}>
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {active && (
              <Button size="icon" variant="ghost" aria-label={`Remove ${share.label}'s access`} title="Remove access" onClick={onRevoke}>
                <UserMinus className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {!active && <Link2 className="h-4 w-4 self-center text-muted-foreground" aria-hidden="true" />}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
