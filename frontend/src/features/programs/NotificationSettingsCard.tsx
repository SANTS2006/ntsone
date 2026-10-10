import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import type { Program } from "@/types/api";
import { useUpdateProgram } from "./hooks";

type NotificationSetting = "notifyOnRegistration" | "notifyOnVerification";

const SETTINGS: { key: NotificationSetting; label: string; on: string; off: string }[] = [
  {
    key: "notifyOnRegistration",
    label: "New registrations",
    on: "Every new registration is emailed with the registrant's answers.",
    off: "No email is sent when someone registers.",
  },
  {
    key: "notifyOnVerification",
    label: "ID card and ticket check-ins",
    on: "An email is sent the first time each ID card or ticket is scanned and verified. Later scans of the same document don't send another.",
    off: "No email is sent when ID cards or tickets are scanned.",
  },
];

/** Emails to the program's team (its admins and viewers, and the account admins) about activity. */
export function NotificationSettingsCard({ program }: { program: Program }) {
  const updateProgram = useUpdateProgram(program.id);

  const toggle = async (key: NotificationSetting, checked: boolean) => {
    try {
      await updateProgram.mutateAsync({ [key]: checked });
      toast.success(checked ? "Email notifications turned on" : "Email notifications turned off");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
          Email notifications
        </CardTitle>
        <CardDescription>
          Emails go to this program&apos;s admins and viewers and to your account admins. Large events can send many
          check-in emails, so turn those off if your team doesn&apos;t need them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {SETTINGS.map((setting) => (
          <div key={setting.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
            <div>
              <Label htmlFor={setting.key} className="font-medium">
                {setting.label}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">{program[setting.key] ? setting.on : setting.off}</p>
            </div>
            <Switch
              id={setting.key}
              checked={program[setting.key]}
              onCheckedChange={(checked) => void toggle(setting.key, checked)}
              disabled={updateProgram.isPending}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
