import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import type { Program } from "@/types/api";
import { useIdCardConfig, useUpdateIdCardConfig } from "../idcards/hooks";
import { useTicketConfig, useUpdateTicketConfig } from "../tickets/hooks";
import { useUpdateProgram } from "./hooks";

/** Rules for who can register, such as one registration per email address. */
export function RegistrationRulesCard({ program }: { program: Program }) {
  const updateProgram = useUpdateProgram(program.id);
  const idCard = useIdCardConfig(program.id);
  const updateIdCard = useUpdateIdCardConfig(program.id);
  const ticket = useTicketConfig(program.id);
  const updateTicket = useUpdateTicketConfig(program.id);

  const toggleIdCard = async (checked: boolean) => {
    if (!idCard.data) return;
    try {
      await updateIdCard.mutateAsync({ ...idCard.data.config, showOnConfirmation: checked });
      toast.success(checked ? "The ID card now shows on the success page" : "The ID card no longer shows on the success page");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  };
  const toggleTicket = async (checked: boolean) => {
    if (!ticket.data) return;
    try {
      await updateTicket.mutateAsync({ ...ticket.data.config, showOnConfirmation: checked });
      toast.success(checked ? "The ticket now shows on the success page" : "The ticket no longer shows on the success page");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  };

  const toggleOnePerEmail = async (checked: boolean) => {
    try {
      await updateProgram.mutateAsync({ oneRegistrationPerEmail: checked });
      toast.success(checked ? "Each email can now register only once" : "Emails can now register more than once");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  };

  const toggleCopy = async (checked: boolean) => {
    try {
      await updateProgram.mutateAsync({ allowSubmissionCopy: checked });
      toast.success(checked ? "Registrants can now preview, print, and download their registration" : "Registrants will no longer see a copy of their registration");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-4 w-4 text-primary" />
          Registration rules
        </CardTitle>
        <CardDescription>Control who can submit the registration form.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div>
            <Label htmlFor="allowCopy" className="font-medium">
              Let registrants preview, print, and download their registration
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {program.allowSubmissionCopy
                ? "After registering, people see buttons on the success page to preview, print, and download a copy of what they submitted."
                : "The success page shows only the confirmation and registration number."}
            </p>
          </div>
          <Switch id="allowCopy" checked={program.allowSubmissionCopy} onCheckedChange={toggleCopy} disabled={updateProgram.isPending} />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div>
            <Label htmlFor="showIdCardOnSuccess" className="font-medium">
              Show the ID card on the success page
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {!program.idCardEnabled
                ? "Turn on ID cards for this program first (see ID cards below)."
                : idCard.data?.config.showOnConfirmation !== false
                  ? "After registering, people see their ID card with a download button."
                  : "People do not see their ID card after registering. Your team can still download it."}
            </p>
          </div>
          <Switch
            id="showIdCardOnSuccess"
            checked={program.idCardEnabled && idCard.data?.config.showOnConfirmation !== false}
            onCheckedChange={toggleIdCard}
            disabled={!program.idCardEnabled || !idCard.data || updateIdCard.isPending}
          />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div>
            <Label htmlFor="showTicketOnSuccess" className="font-medium">
              Show the ticket on the success page
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {!program.ticketEnabled
                ? "Turn on tickets for this program first (see Tickets below)."
                : ticket.data?.config.showOnConfirmation !== false
                  ? "After registering, people see their ticket with a download button."
                  : "People do not see their ticket after registering. Your team can still download it."}
            </p>
          </div>
          <Switch
            id="showTicketOnSuccess"
            checked={program.ticketEnabled && ticket.data?.config.showOnConfirmation !== false}
            onCheckedChange={toggleTicket}
            disabled={!program.ticketEnabled || !ticket.data || updateTicket.isPending}
          />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div>
            <Label htmlFor="onePerEmail" className="font-medium">
              One registration per email address
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {program.oneRegistrationPerEmail
                ? "Anyone who tries to register again with the same email is told their registration failed because they can only register once."
                : "The same email address can be used to register as many times as needed."}{" "}
              This uses the form&apos;s email question, so make sure your form has one.
            </p>
          </div>
          <Switch
            id="onePerEmail"
            checked={program.oneRegistrationPerEmail}
            onCheckedChange={toggleOnePerEmail}
            disabled={updateProgram.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
