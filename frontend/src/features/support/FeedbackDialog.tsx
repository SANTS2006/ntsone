import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FEEDBACK_CATEGORY_LABELS, sendFeedback, type FeedbackCategory } from "./api";

/**
 * Lets admins and viewers tell the platform team about improvements, bugs, or features
 * they want. It goes to the team's inbox and email; `programId` notes which program it's about.
 */
export function FeedbackDialog({
  programId,
  programName,
  trigger,
}: {
  programId?: string;
  programName?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<FeedbackCategory>("improvement");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const reset = () => {
    setCategory("improvement");
    setSubject("");
    setMessage("");
    setSent(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3) return toast.error("Enter a short subject");
    if (message.trim().length < 10) return toast.error("Please write at least 10 characters");
    setSending(true);
    try {
      await sendFeedback({ category, subject: subject.trim(), message: message.trim(), programId });
      setSent(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Your feedback could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <MessageSquarePlus className="h-4 w-4" />
            Send feedback
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-success text-white">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="text-lg font-semibold">Thank you for your feedback</p>
            <p className="text-sm text-muted-foreground">It has been sent to our team, who may reply by email.</p>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                Tell us about an improvement, a bug, or a feature you&apos;d like
                {programName ? ` (about ${programName})` : ""}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FEEDBACK_CATEGORY_LABELS) as FeedbackCategory[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                    category === key ? "border-primary bg-gradient-brand-soft text-primary" : "border-border hover:border-primary/50",
                  )}
                >
                  {FEEDBACK_CATEGORY_LABELS[key]}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feedback-subject">Subject</Label>
              <Input id="feedback-subject" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feedback-message">Details</Label>
              <Textarea
                id="feedback-message"
                rows={6}
                maxLength={5000}
                placeholder="What happened, what you expected, or what you'd like the system to do."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <Button type="submit" loading={sending} className="w-fit">
              Send feedback
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
