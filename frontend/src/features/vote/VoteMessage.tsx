import type * as React from "react";
import { CalendarX2, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  success: { icon: CheckCircle2, ring: "bg-gradient-success" },
  error: { icon: XCircle, ring: "bg-destructive" },
  closed: { icon: CalendarX2, ring: "bg-slate-500" },
  waiting: { icon: Clock3, ring: "bg-amber-500" },
} as const;

/** A full-width status message: voting success, voting failed, closed, or not open yet. */
export function VoteMessage({
  tone,
  title,
  message,
  children,
}: {
  tone: keyof typeof TONES;
  title: string;
  message: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { icon: Icon, ring } = TONES[tone];
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span className={cn("flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg", ring)}>
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <div className="max-w-md text-sm text-muted-foreground">{message}</div>
        {children}
      </CardContent>
    </Card>
  );
}
