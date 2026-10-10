import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Rocket, Share2 } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api";
import type { AuthUser } from "@/types/api";

/** Marks something that belongs to someone else's account but that you were given access to. */
export function SharedBadge({ tenantId }: { tenantId: string | null | undefined }) {
  const { user } = useAuth();
  if (!user || user.role === "super_admin" || !tenantId || tenantId === user.tenantId) return null;
  return (
    <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
      <Share2 className="h-3 w-3" aria-hidden="true" />
      Shared with you
    </Badge>
  );
}

/**
 * For team members who were invited into someone else's account: one click opens a space of their
 * own, where they are the admin. What they were invited to stays exactly as it was.
 */
export function OwnSpaceCard() {
  const { user, updateLocalUser } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  if (!user || (user.role !== "viewer" && user.role !== "program_admin")) return null;

  const open = async () => {
    setBusy(true);
    try {
      const result = await apiFetch<{ user: AuthUser }>("/auth/me/own-space", { method: "POST" });
      updateLocalUser(result.user);
      await queryClient.invalidateQueries();
      toast.success("Your own space is ready. You can now create your own programs, polls and businesses.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't open your space");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-gradient-brand-soft">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Start a space of your own</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;re here as a team member. Open your own space to create your own programs, voting polls and businesses with full admin control, and invite others. What you were invited to stays as it is.
            </p>
          </div>
        </div>
        <Button onClick={open} loading={busy} className="shrink-0">
          Create my own space
        </Button>
      </CardContent>
    </Card>
  );
}
