import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Check, Vote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { getVerifiedVoters, saveVerifiedVoters, type Poll } from "./api";
import { pollKeys } from "./hooks";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Splits pasted text on spaces, commas, semicolons and new lines into unique lower-case emails. */
function parseEmails(text: string) {
  const items = text
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(items)];
  return { valid: unique.filter((e) => EMAIL.test(e)), invalid: unique.filter((e) => !EMAIL.test(e)) };
}

/**
 * Lets an admin limit a poll to people they've verified: turn it on, paste the eligible emails, and
 * save. Anyone else is refused when they try to create an account or vote.
 */
export function VerifiedVotersCard({ poll, canEdit }: { poll: Poll; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: [...pollKeys.all, "verified", poll.id],
    queryFn: () => getVerifiedVoters(poll.id),
  });
  const [enabled, setEnabled] = React.useState(false);
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setText(data.voters.map((v) => v.email).join("\n"));
  }, [data]);

  const { valid, invalid } = React.useMemo(() => parseEmails(text), [text]);
  const savedEmails = React.useMemo(() => (data?.voters ?? []).map((v) => v.email).join("\n"), [data]);
  const dirty = !!data && (enabled !== data.enabled || valid.join("\n") !== savedEmails);
  const signedUp = data?.voters.filter((v) => v.signedUp).length ?? 0;
  const voted = data?.voters.filter((v) => v.voted).length ?? 0;

  const save = async () => {
    if (invalid.length) return toast.error(`Fix or remove ${invalid.length === 1 ? "this email" : "these emails"}: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`);
    if (enabled && valid.length === 0) return toast.error("Add at least one email, or nobody will be able to vote");
    setSaving(true);
    try {
      const saved = await saveVerifiedVoters(poll.id, { enabled, emails: valid });
      queryClient.setQueryData([...pollKeys.all, "verified", poll.id], saved);
      await queryClient.invalidateQueries({ queryKey: pollKeys.detail(poll.id) });
      toast.success(enabled ? `${saved.voters.length} verified voter${saved.voters.length === 1 ? "" : "s"} saved` : "Verified voters turned off");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the verified voters");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          Verified voters
        </CardTitle>
        <CardDescription>Only people whose email you list here can create an account, sign in, or vote.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div>
            <Label htmlFor="verified-only" className="font-medium">
              Only verified voters can vote
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {enabled
                ? "Anyone not on the list is told they can't create an account because they aren't verified as an eligible voter."
                : "Anyone with a confirmed email can create an account and vote."}
            </p>
          </div>
          <Switch id="verified-only" checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit || saving} />
        </div>

        {enabled && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="verified-emails">Eligible voters&apos; emails</Label>
            <Textarea
              id="verified-emails"
              rows={8}
              spellCheck={false}
              placeholder={"mariama@example.com\nibrahim@example.com"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!canEdit || saving}
              aria-describedby="verified-help"
            />
            <p id="verified-help" className="text-xs text-muted-foreground">
              One per line, or separated by commas or spaces. Emails you remove here are no longer verified once you save.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{valid.length} email{valid.length === 1 ? "" : "s"}</Badge>
              {data && (
                <>
                  <Badge variant="outline">
                    <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                    {signedUp} signed up
                  </Badge>
                  <Badge variant="outline">
                    <Vote className="mr-1 h-3 w-3" aria-hidden="true" />
                    {voted} voted
                  </Badge>
                </>
              )}
              {invalid.length > 0 && (
                <span role="alert" className="text-destructive">
                  Not valid: {invalid.slice(0, 3).join(", ")}
                  {invalid.length > 3 ? ` and ${invalid.length - 3} more` : ""}
                </span>
              )}
            </div>
          </div>
        )}

        {canEdit && (
          <Button onClick={save} loading={saving} disabled={!dirty || saving} className="w-fit">
            {saving ? "Saving..." : "Save verified voters"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
