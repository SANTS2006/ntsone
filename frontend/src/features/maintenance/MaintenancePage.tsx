import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Send, Wrench } from "lucide-react";
import { Loading } from "@/components/Loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { AREA_LABEL, maintenanceKey, type MaintenanceArea } from "./MaintenanceGate";

interface Settings {
  enabled: boolean;
  message: string;
  mode: "banner" | "page";
  scope: "all" | "selected";
  areas: MaintenanceArea[];
  endsAt: string | null;
  notifyStaff: boolean;
  notifyVoters: boolean;
  notifyWhenBack: boolean;
  updatedAt: string | null;
  lastNotifiedAt: string | null;
  lastNotifiedCount: number;
  areasAvailable: MaintenanceArea[];
  recipients: { staff: number; staffAndVoters: number };
}

const toInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/** Maintenance mode, for the platform's super admin: switch it on, say what to tell people, choose where it shows, and email them. */
export function MaintenancePage() {
  usePageMeta({ title: "Maintenance" });
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["platform-maintenance"], queryFn: () => apiFetch<Settings>("/platform/maintenance") });
  const [enabled, setEnabled] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [mode, setMode] = React.useState<"banner" | "page">("banner");
  const [scope, setScope] = React.useState<"all" | "selected">("all");
  const [areas, setAreas] = React.useState<MaintenanceArea[]>([]);
  const [endsAt, setEndsAt] = React.useState("");
  const [notifyStaff, setNotifyStaff] = React.useState(true);
  const [notifyVoters, setNotifyVoters] = React.useState(false);
  const [notifyWhenBack, setNotifyWhenBack] = React.useState(false);

  React.useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setMessage(data.message);
    setMode(data.mode);
    setScope(data.scope);
    setAreas(data.areas);
    setEndsAt(toInput(data.endsAt));
    setNotifyStaff(data.notifyStaff);
    setNotifyVoters(data.notifyVoters);
    setNotifyWhenBack(data.notifyWhenBack);
  }, [data]);

  const wasOn = data?.enabled ?? false;
  const emailsOnSave = enabled && !wasOn && (notifyStaff || notifyVoters);
  const people = data ? (notifyVoters ? data.recipients.staffAndVoters : notifyStaff ? data.recipients.staff : 0) : 0;
  const valid = message.trim().length >= 5 && (scope === "all" || areas.length > 0);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ emailsQueued: number }>("/platform/maintenance", {
        method: "PUT",
        body: { enabled, message: message.trim(), mode, scope, areas: scope === "all" ? [] : areas, endsAt: endsAt ? new Date(endsAt).toISOString() : null, notifyStaff, notifyVoters, notifyWhenBack },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["platform-maintenance"] });
      await queryClient.invalidateQueries({ queryKey: maintenanceKey });
      toast.success(enabled ? `Maintenance mode is on${result.emailsQueued ? `. ${result.emailsQueued} emails are on their way.` : "."}` : "Maintenance mode is off");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save the maintenance settings"),
  });

  const resend = useMutation({
    mutationFn: () => apiFetch<{ emailsQueued: number }>("/platform/maintenance/notify", { method: "POST" }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["platform-maintenance"] });
      toast.success(`${result.emailsQueued} emails are on their way`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not send the emails"),
  });

  if (isLoading || !data) return <Loading label="Loading maintenance settings" />;

  const toggleArea = (area: MaintenanceArea) => setAreas((list) => (list.includes(area) ? list.filter((a) => a !== area) : [...list, area]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <Wrench className="h-6 w-6 text-primary" />
          Maintenance
        </h1>
        <p className="text-sm text-muted-foreground">Tell everyone the system is being worked on. Switch it on, choose where the message shows, and email people.</p>
      </div>

      <Card className={cn(data.enabled && "border-amber-500/50")}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              Maintenance mode
              {data.enabled ? <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-200" variant="secondary">On</Badge> : <Badge variant="secondary">Off</Badge>}
            </p>
            <p className="text-sm text-muted-foreground">
              {data.enabled ? "The message is showing now on the parts of the site you chose below." : "Nothing is showing. People see the site as usual."}
              {data.lastNotifiedAt ? ` Last emailed ${new Date(data.lastNotifiedAt).toLocaleString()} (${data.lastNotifiedCount} people).` : ""}
            </p>
          </div>
          <label className="flex items-center gap-3">
            <span className="text-sm font-medium">{enabled ? "On" : "Off"}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Maintenance mode" />
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What people see</CardTitle>
            <CardDescription>A short, friendly message. It also goes in the email.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mt-message">Message</Label>
              <Textarea id="mt-message" rows={4} maxLength={600} value={message} onChange={(e) => setMessage(e.target.value)} />
              <p className="text-xs text-muted-foreground">{message.length}/600</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mt-end">Expected back (optional)</Label>
              <Input id="mt-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full sm:w-64" />
              <p className="text-xs text-muted-foreground">Shown to people. The message stops showing by itself once this time has passed.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>How it shows</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: "banner", title: "A message at the top", text: "People can keep using the page." },
                    { value: "page", title: "Replace the page", text: "People see a maintenance screen instead." },
                  ] as const
                ).map((choice) => (
                  <button key={choice.value} type="button" aria-pressed={mode === choice.value} onClick={() => setMode(choice.value)} className={cn("rounded-xl border-2 p-3 text-left transition-colors", mode === choice.value ? "border-primary bg-gradient-brand-soft" : "border-border/70 hover:border-primary/40")}>
                    <span className="block text-sm font-semibold">{choice.title}</span>
                    <span className="block text-xs text-muted-foreground">{choice.text}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">The platform team is never locked out. Sign-in pages only ever get the message at the top, so you can always sign in.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where it shows</CardTitle>
            <CardDescription>Everywhere, or only on the parts you pick.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { value: "all", title: "Everywhere", text: "Every page of the system." },
                  { value: "selected", title: "Only some parts", text: "Choose from the list." },
                ] as const
              ).map((choice) => (
                <button key={choice.value} type="button" aria-pressed={scope === choice.value} onClick={() => setScope(choice.value)} className={cn("rounded-xl border-2 p-3 text-left transition-colors", scope === choice.value ? "border-primary bg-gradient-brand-soft" : "border-border/70 hover:border-primary/40")}>
                  <span className="block text-sm font-semibold">{choice.title}</span>
                  <span className="block text-xs text-muted-foreground">{choice.text}</span>
                </button>
              ))}
            </div>
            {scope === "selected" && (
              <ul className="flex flex-col gap-2">
                {data.areasAvailable.map((area) => (
                  <li key={area} className="flex items-start gap-3 rounded-lg border border-border/70 p-3">
                    <Checkbox id={`area-${area}`} checked={areas.includes(area)} onCheckedChange={() => toggleArea(area)} className="mt-0.5" />
                    <Label htmlFor={`area-${area}`} className="flex flex-col gap-0.5 font-normal">
                      <span className="font-medium">{AREA_LABEL[area].label}</span>
                      <span className="text-xs text-muted-foreground">{AREA_LABEL[area].hint}</span>
                    </Label>
                  </li>
                ))}
                {areas.length === 0 && <li className="text-xs text-destructive">Choose at least one part.</li>}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            Email people
          </CardTitle>
          <CardDescription>Sent once when you switch maintenance on, not every time you save.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={notifyStaff} onCheckedChange={(v) => setNotifyStaff(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium">Team members and admins</span>
              <span className="block text-xs text-muted-foreground">{data.recipients.staff} people with a confirmed email</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={notifyVoters} onCheckedChange={(v) => setNotifyVoters(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium">Voters too</span>
              <span className="block text-xs text-muted-foreground">{data.recipients.staffAndVoters - data.recipients.staff} voters with a confirmed email</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={notifyWhenBack} onCheckedChange={(v) => setNotifyWhenBack(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium">Email again when the system is back</span>
              <span className="block text-xs text-muted-foreground">Goes to the same people when you switch maintenance off.</span>
            </span>
          </label>
          {emailsOnSave && people > 250 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              {people} emails will be sent. Your email plan may allow only a few hundred a day, so some may arrive later or be refused. Consider emailing team members only.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
          {enabled ? (wasOn ? "Save changes" : `Switch maintenance on${emailsOnSave ? ` and email ${people} people` : ""}`) : wasOn ? "Switch maintenance off" : "Save"}
        </Button>
        {data.enabled && (
          <Button variant="outline" onClick={() => resend.mutate()} loading={resend.isPending} disabled={!(data.notifyStaff || data.notifyVoters)}>
            <Send className="h-4 w-4" />
            Email the notice again
          </Button>
        )}
      </div>
    </div>
  );
}
