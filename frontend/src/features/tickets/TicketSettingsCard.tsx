import { Loading } from "@/components/Loading";
import * as React from "react";
import { toast } from "sonner";
import { Ticket } from "lucide-react";
import { formatLeones, renderTicket, sampleQrMatrix, TICKET_DESIGNS, ticketDesign, ticketHasBack, code128 } from "@designs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Program } from "@/types/api";
import { getAdminForm } from "../form-builder/api";
import { uploadIdCardBackground } from "../idcards/api";
import { DesignColorsField, ImagePickerField, ShowOnConfirmationToggle } from "../idcards/IdCardSettingsCard";
import { useUpdateProgram } from "../programs/hooks";
import { ContentChecklist } from "../designs/ContentChecklist";
import { DesignGallery } from "../designs/DesignGallery";
import { UploadDesignTile } from "../designs/UploadDesignTile";
import type { TicketConfig } from "./api";
import { useTicketConfig, useUpdateTicketConfig } from "./hooks";
import { TicketPreview, type TicketPreviewContext } from "./TicketPreview";

const MAX_VISIBLE_FIELDS = 2;
const THUMB_QR = sampleQrMatrix();
const THUMB_BARCODE = code128("REG-2026-000123");

function formatProgramDates(program: Program): string | undefined {
  if (!program.startDate) return undefined;
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const start = fmt(program.startDate);
  const end = program.endDate ? fmt(program.endDate) : start;
  return start === end ? start : `${start} - ${end}`;
}

function TextField({
  label,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ""} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function TicketSettingsCard({ program }: { program: Program }) {
  const { data, isLoading } = useTicketConfig(program.id);
  const updateConfig = useUpdateTicketConfig(program.id);
  const updateProgram = useUpdateProgram(program.id);
  const [config, setConfig] = React.useState<TicketConfig | null>(null);
  const [availableFields, setAvailableFields] = React.useState<{ fieldKey: string; label: string }[]>([]);
  const [uploading, setUploading] = React.useState<"logo" | "background" | "event" | null>(null);
  const [side, setSide] = React.useState<"front" | "back">("front");

  React.useEffect(() => {
    if (data) setConfig(data.config);
  }, [data]);

  React.useEffect(() => {
    getAdminForm(program.id)
      .then((form) =>
        setAvailableFields(
          form.fields.filter((f) => !f.type.endsWith("_upload")).map((f) => ({ fieldKey: f.fieldKey, label: f.label })),
        ),
      )
      .catch(() => setAvailableFields([]));
  }, [program.id]);

  const programDates = formatProgramDates(program);
  const organizationName = data?.organizationName ?? "Your organization";
  const fieldLabels = React.useMemo(
    () =>
      (config?.visibleFields ?? [])
        .map((key) => availableFields.find((f) => f.fieldKey === key)?.label)
        .filter((l): l is string => Boolean(l)),
    [config?.visibleFields, availableFields],
  );
  const context = React.useMemo<TicketPreviewContext>(
    () => ({ organizationName, programName: program.name, programDates, shortDescription: program.shortDescription, fieldLabels }),
    [organizationName, program.name, programDates, program.shortDescription, fieldLabels],
  );

  const logoUrl = config?.logoUrl;
  const thumbnails = React.useMemo(
    () =>
      TICKET_DESIGNS.map((d) => ({
        id: d.id,
        name: d.name,
        svg: renderTicket(
          d.id,
          {
            logo: { image: logoUrl ?? null, orgName: organizationName, tagline: program.name },
            kicker: organizationName,
            title: program.name,
            subtitle: program.shortDescription ?? "",
            date: programDates,
            time: "09:00 AM - 05:00 PM",
            venue: "Venue name and address",
            participantName: "Jordan Avery",
            registrationNumber: "REG-2026-000123",
            fields: [],
            qr: THUMB_QR,
            barcode: THUMB_BARCODE,
          },
          d.defaults,
        ),
      })),
    [logoUrl, organizationName, program.name, program.shortDescription, programDates],
  );

  if (isLoading || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <Loading inline label="Loading" />
        </CardContent>
      </Card>
    );
  }

  const set = (patch: Partial<TicketConfig>) => setConfig((c) => (c ? { ...c, ...patch } : c));
  const customActive = config.template === "custom";

  const chooseDesign = (id: string) => {
    const { defaults } = ticketDesign(id);
    set({ template: id, primaryColor: defaults.primary, secondaryColor: defaults.secondary });
  };

  const toggleField = (fieldKey: string) => {
    if (config.visibleFields.includes(fieldKey)) {
      set({ visibleFields: config.visibleFields.filter((k) => k !== fieldKey) });
    } else if (config.visibleFields.length >= MAX_VISIBLE_FIELDS) {
      toast.error(`You can show up to ${MAX_VISIBLE_FIELDS} extra fields on the ticket`);
    } else {
      set({ visibleFields: [...config.visibleFields, fieldKey] });
    }
  };

  const upload = async (kind: "logo" | "background" | "event", file: File) => {
    setUploading(kind);
    try {
      const url = await uploadIdCardBackground(program.id, file);
      if (kind === "logo") set({ logoUrl: url });
      else if (kind === "event") set({ eventImageUrl: url });
      else set({ template: "custom", backgroundImageUrl: url });
      toast.success(`${kind === "logo" ? "Logo" : kind === "event" ? "Event image" : "Design"} uploaded. Remember to save.`);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  };

  // Dropping the uploaded design falls back to the first built-in design if it was in use.
  const removeUploadedDesign = () => {
    if (customActive) chooseDesign(TICKET_DESIGNS[0]!.id);
    set({ backgroundImageUrl: undefined });
    toast.success("Design removed. Remember to save.");
  };

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateProgram.mutateAsync({ ticketEnabled: checked });
      toast.success(checked ? "Tickets enabled" : "Tickets disabled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  };

  const handleSave = async () => {
    if (config.isPaid && config.priceAmount === undefined) {
      toast.error("Enter the ticket price in leones, or set the ticket to Free");
      return;
    }
    if (customActive && !config.backgroundImageUrl) {
      toast.error("Upload your ticket design first, or pick one of the designs");
      return;
    }
    try {
      await updateConfig.mutateAsync(config);
      toast.success("Ticket design saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save ticket design");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4 text-primary" />
            Tickets
          </CardTitle>
          <CardDescription>
            Pick a design and every registrant gets a printable ticket with their name, a barcode, and a verification QR
            code. You can also upload your own ticket design.
          </CardDescription>
        </div>
        <Switch checked={program.ticketEnabled} onCheckedChange={handleToggleEnabled} />
      </CardHeader>

      {program.ticketEnabled && (
        <CardContent className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <Label>Design</Label>
            <DesignGallery options={thumbnails} selected={config.template} onSelect={chooseDesign} columns="grid-cols-1 sm:grid-cols-3">
              <UploadDesignTile
                imageUrl={config.backgroundImageUrl}
                active={customActive}
                uploading={uploading === "background"}
                aspectClassName="aspect-[3/1]"
                onSelect={() => set({ template: "custom" })}
                onUpload={(file) => void upload("background", file)}
                onRemove={removeUploadedDesign}
              />
            </DesignGallery>
          </section>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Live preview
                {ticketHasBack(config.template)
                  ? " · two-sided, downloads as a PDF"
                  : " · one-sided, downloads as an image"}
              </p>
              {ticketHasBack(config.template) && (
                <div className="flex rounded-full border border-border p-0.5 text-xs font-medium">
                  {(["front", "back"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSide(s)}
                      className={cn(
                        "rounded-full px-3 py-0.5 capitalize transition-colors",
                        side === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <TicketPreview config={config} context={context} side={ticketHasBack(config.template) ? side : "front"} />
          </div>

          <section className="flex flex-col gap-2">
            <Label>Price</Label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-border p-0.5">
                {(
                  [
                    [false, "Free"],
                    [true, "Paid"],
                  ] as const
                ).map(([paid, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => set({ isPaid: paid })}
                    className={cn(
                      "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                      config.isPaid === paid ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {config.isPaid && (
                <div className="relative w-44">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    Le
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className="pl-9"
                    placeholder="Amount"
                    value={config.priceAmount ?? ""}
                    onChange={(e) => set({ priceAmount: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })}
                    aria-label="Ticket price in leones"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {config.showPrice === false
                  ? "The price is hidden on the ticket."
                  : config.isPaid
                    ? config.priceAmount !== undefined
                      ? `Tickets show ${formatLeones(config.priceAmount)}.`
                      : "Enter the price in leones."
                    : "Tickets show FREE."}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {customActive ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Text color</Label>
                  <div className="flex gap-2">
                    {(["light", "dark"] as const).map((tone) => (
                      <Button
                        key={tone}
                        type="button"
                        size="sm"
                        variant={config.textColor === tone ? "default" : "outline"}
                        onClick={() => set({ textColor: tone })}
                      >
                        {tone === "light" ? "Light" : "Dark"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Tint for readability ({Math.round(config.overlayOpacity * 100)}%)</Label>
                  <input
                    type="range"
                    min={0}
                    max={0.8}
                    step={0.05}
                    value={config.overlayOpacity}
                    onChange={(e) => set({ overlayOpacity: Number(e.target.value) })}
                    className="accent-primary"
                  />
                </div>
              </div>
            ) : (
              <DesignColorsField
                primary={config.primaryColor}
                secondary={config.secondaryColor}
                onChange={set}
                onReset={() => chooseDesign(config.template)}
              />
            )}
            <ImagePickerField
              label="Logo"
              hint="Leave empty to show an emblem with your organization's initials and name."
              value={config.logoUrl}
              uploading={uploading === "logo"}
              onUpload={(file) => void upload("logo", file)}
              onRemove={() => set({ logoUrl: undefined })}
            />
            <ImagePickerField
              label="Event image"
              hint="A photo or flyer for designs with a picture panel. Leave empty to use the design's own artwork."
              value={config.eventImageUrl}
              uploading={uploading === "event"}
              onUpload={(file) => void upload("event", file)}
              onRemove={() => set({ eventImageUrl: undefined })}
            />
          </div>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Event title" value={config.eventTitle} placeholder={program.name} maxLength={120} onChange={(v) => set({ eventTitle: v })} />
            <TextField
              label="Subtitle"
              value={config.tagline}
              placeholder={program.shortDescription ?? "e.g. Collaboration in the business landscape"}
              maxLength={140}
              onChange={(v) => set({ tagline: v })}
            />
            <TextField label="Small line above the title" value={config.kicker} placeholder={organizationName} maxLength={80} onChange={(v) => set({ kicker: v })} />
            <TextField label="Date" value={config.eventDate} placeholder={programDates ?? "e.g. 20 May 2026"} maxLength={100} onChange={(v) => set({ eventDate: v })} />
            <TextField label="Time" value={config.eventTime} placeholder="e.g. 09:00 AM - 05:00 PM" maxLength={60} onChange={(v) => set({ eventTime: v })} />
            <TextField label="Venue" value={config.venue} placeholder="e.g. Miatta Conference Hall, Freetown" maxLength={200} onChange={(v) => set({ venue: v })} />
            <TextField label="Contact phone" value={config.contactPhone} placeholder="+232 76 000 000" maxLength={60} onChange={(v) => set({ contactPhone: v })} />
            <TextField label="Website" value={config.website} placeholder="www.example.org" maxLength={120} onChange={(v) => set({ website: v })} />
          </section>
          <p className="-mt-3 text-xs text-muted-foreground">Leave the title, subtitle, or date blank to use the program&apos;s own details.</p>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticketTerms">Terms / notes (shown on your own design)</Label>
              <Textarea
                id="ticketTerms"
                rows={3}
                maxLength={300}
                placeholder="e.g. Non-transferable. Present this ticket at the entrance."
                value={config.terms ?? ""}
                onChange={(e) => set({ terms: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Extra fields on the ticket (up to {MAX_VISIBLE_FIELDS})</Label>
              <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border/70 p-3">
                {availableFields.length === 0 && (
                  <p className="text-xs text-muted-foreground">No form fields yet. Build the form first.</p>
                )}
                {availableFields.map((field) => (
                  <label key={field.fieldKey} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={config.visibleFields.includes(field.fieldKey)}
                      onCheckedChange={() => toggleField(field.fieldKey)}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <Label>What&apos;s on the ticket</Label>
            <ContentChecklist
              items={[
                { key: "showPrice", label: "Price" },
                { key: "showParticipantName", label: "Registrant's name" },
                { key: "showRegistrationNumber", label: "Registration number" },
                { key: "showQrCode", label: "Verification QR code", hint: "On designs that print one" },
                { key: "showBarcode", label: "Barcode", hint: "On designs that print one" },
                { key: "showEventDetails", label: "Date, time, and venue" },
                { key: "showContact", label: "Contact phone and website" },
              ]}
              values={config}
              onChange={(key, checked) => set({ [key]: checked })}
            />
          </section>

          <ShowOnConfirmationToggle
            id="ticketShowOnConfirmation"
            checked={config.showOnConfirmation}
            onChange={(checked) => set({ showOnConfirmation: checked })}
            thing="ticket"
          />

          <Button onClick={handleSave} loading={updateConfig.isPending} className="w-fit">
            {updateConfig.isPending ? "Saving..." : "Save ticket design"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
