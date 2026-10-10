import { Loading } from "@/components/Loading";
import * as React from "react";
import { toast } from "sonner";
import { CreditCard, ImagePlus, RotateCcw, Upload, X } from "lucide-react";
import { ID_CARD_DESIGNS, idCardDesign, renderIdCard } from "@designs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FieldType, Program } from "@/types/api";
import { getAdminForm } from "../form-builder/api";
import { useUpdateProgram } from "../programs/hooks";
import { ContentChecklist } from "../designs/ContentChecklist";
import { DesignGallery } from "../designs/DesignGallery";
import { UploadDesignTile } from "../designs/UploadDesignTile";
import { useIdCardConfig, useUpdateIdCardConfig } from "./hooks";
import { uploadIdCardBackground, type IdCardConfig } from "./api";
import { IdCardPreview, idCardPreviewContent, type IdCardPreviewContext } from "./IdCardPreview";

const MAX_VISIBLE_FIELDS = 3;

// What the design thumbnails are drawn with; only the logo and program details vary.
const THUMBNAIL_CONFIG: IdCardConfig = {
  template: "aurora",
  primaryColor: "#000000",
  secondaryColor: "#000000",
  roleText: "Participant",
  visibleFields: [],
  showQrCode: true,
  signatureLabel: "Authorized Signature",
  showOnConfirmation: true,
  photoSource: "field",
  showRegistrationNumber: true,
  showRole: true,
  showDates: true,
  showTerms: true,
  showContact: true,
  showSignature: true,
  showBarcode: true,
};

/** Whether registrants can view/download the document on the public success page. */
export function ShowOnConfirmationToggle({
  id,
  checked,
  onChange,
  thing,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  thing: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
      <div>
        <Label htmlFor={id} className="font-medium">
          Show on the registration success page
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {checked
            ? `Registrants see their ${thing} and can download it right after registering.`
            : `Only your team can download ${thing}s, from each registration's page.`}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** A labelled pair of color pickers with a reset to the chosen design's own colors. */
export function DesignColorsField({
  primary,
  secondary,
  onChange,
  onReset,
}: {
  primary: string;
  secondary: string;
  onChange: (patch: { primaryColor?: string; secondaryColor?: string }) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>Colors</Label>
        <button type="button" onClick={onReset} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3 w-3" />
          Design colors
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["primaryColor", "Main", primary],
            ["secondaryColor", "Accent", secondary],
          ] as const
        ).map(([key, label, value]) => (
          <label key={key} className="flex items-center gap-2 rounded-lg border border-input px-2 py-1.5 text-sm">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange({ [key]: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto tabular-nums text-xs uppercase">{value}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Upload / replace / remove for an image such as a logo. */
export function ImagePickerField({
  label,
  hint,
  value,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  hint: string;
  value?: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value && <img src={value} alt="" className="h-10 w-16 rounded-md border border-border object-contain p-1" />}
        <Button variant="outline" size="sm" className="relative" loading={uploading}>
          {value ? <ImagePlus className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading..." : value ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

interface AvailableField {
  fieldKey: string;
  label: string;
  type: FieldType;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined;
}

export function IdCardSettingsCard({ program }: { program: Program }) {
  const { data, isLoading } = useIdCardConfig(program.id);
  const updateConfig = useUpdateIdCardConfig(program.id);
  const updateProgram = useUpdateProgram(program.id);
  const [config, setConfig] = React.useState<IdCardConfig | null>(null);
  const [availableFields, setAvailableFields] = React.useState<AvailableField[]>([]);
  const [uploading, setUploading] = React.useState<"logo" | "background" | "flyer" | null>(null);
  const [side, setSide] = React.useState<"front" | "back">("front");

  React.useEffect(() => {
    if (data) setConfig(data.config);
  }, [data]);

  React.useEffect(() => {
    getAdminForm(program.id)
      .then((form) => setAvailableFields(form.fields.map((f) => ({ fieldKey: f.fieldKey, label: f.label, type: f.type }))))
      .catch(() => setAvailableFields([]));
  }, [program.id]);

  const organizationName = data?.organizationName ?? "Your organization";
  const fieldLabels = React.useMemo(
    () =>
      (config?.visibleFields ?? [])
        .map((key) => availableFields.find((f) => f.fieldKey === key)?.label)
        .filter((l): l is string => Boolean(l)),
    [config?.visibleFields, availableFields],
  );
  const context = React.useMemo<IdCardPreviewContext>(
    () => ({ organizationName, programName: program.name, fieldLabels, validUntil: formatDate(program.endDate) }),
    [organizationName, program.name, fieldLabels, program.endDate],
  );

  // Thumbnails use each design's own colors so the choice is clear.
  const logoUrl = config?.logoUrl;
  const thumbnails = React.useMemo(() => {
    const content = idCardPreviewContent({ ...THUMBNAIL_CONFIG, logoUrl }, context);
    return ID_CARD_DESIGNS.map((d) => ({ id: d.id, name: d.name, svg: renderIdCard(d.id, content, d.defaults).front }));
  }, [logoUrl, context]);

  if (isLoading || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ID Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Loading inline label="Loading" />
        </CardContent>
      </Card>
    );
  }

  const set = (patch: Partial<IdCardConfig>) => setConfig((c) => (c ? { ...c, ...patch } : c));
  const photoFields = availableFields.filter((f) => f.type === "image_upload");
  const textFields = availableFields.filter((f) => !f.type.endsWith("_upload"));

  const chooseDesign = (id: string) => {
    const { defaults } = idCardDesign(id);
    set({ template: id, primaryColor: defaults.primary, secondaryColor: defaults.secondary });
  };

  const toggleField = (fieldKey: string) => {
    if (config.visibleFields.includes(fieldKey)) {
      set({ visibleFields: config.visibleFields.filter((k) => k !== fieldKey) });
    } else if (config.visibleFields.length >= MAX_VISIBLE_FIELDS) {
      toast.error(`You can show up to ${MAX_VISIBLE_FIELDS} extra fields on the card`);
    } else {
      set({ visibleFields: [...config.visibleFields, fieldKey] });
    }
  };

  const chooseCustom = (backgroundImageUrl?: string) =>
    set({ template: "custom", ...(backgroundImageUrl ? { backgroundImageUrl } : {}) });

  const upload = async (kind: "logo" | "background" | "flyer", file: File) => {
    setUploading(kind);
    try {
      const url = await uploadIdCardBackground(program.id, file);
      if (kind === "logo") set({ logoUrl: url });
      else if (kind === "flyer") set({ flyerUrl: url, photoSource: "flyer" });
      else chooseCustom(url);
      toast.success(`${kind === "logo" ? "Logo" : kind === "flyer" ? "Flyer" : "Design"} uploaded. Remember to save.`);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  };

  // Dropping the uploaded design falls back to the first built-in design if it was in use.
  const removeUploadedDesign = () => {
    if (customActive) chooseDesign(ID_CARD_DESIGNS[0]!.id);
    set({ backgroundImageUrl: undefined });
    toast.success("Design removed. Remember to save.");
  };

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateProgram.mutateAsync({ idCardEnabled: checked });
      toast.success(checked ? "ID cards enabled" : "ID cards disabled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  };

  const handleSave = async () => {
    if (config.template === "custom" && !config.backgroundImageUrl) {
      toast.error("Upload your card design first, or pick one of the designs");
      return;
    }
    try {
      await updateConfig.mutateAsync({
        ...config,
        roleOptions: (config.roleOptions ?? []).map((r) => r.trim()).filter(Boolean),
      });
      toast.success("ID card design saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save ID card design");
    }
  };

  const customActive = config.template === "custom";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" />
            ID Card
          </CardTitle>
          <CardDescription>
            Pick a design and every registrant gets a printable two-sided ID card with their photo, details, and a
            verification QR code.
          </CardDescription>
        </div>
        <Switch checked={program.idCardEnabled} onCheckedChange={handleToggleEnabled} />
      </CardHeader>
      {program.idCardEnabled && (
        <CardContent className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <Label>Design</Label>
              <DesignGallery
                options={thumbnails}
                selected={config.template}
                onSelect={chooseDesign}
                columns="grid-cols-3 sm:grid-cols-5"
              >
                <UploadDesignTile
                  imageUrl={config.backgroundImageUrl}
                  active={customActive}
                  uploading={uploading === "background"}
                  aspectClassName="aspect-[300/476]"
                  onSelect={() => chooseCustom()}
                  onUpload={(file) => void upload("background", file)}
                  onRemove={removeUploadedDesign}
                />
              </DesignGallery>
              {customActive && (
                <p className="text-xs text-muted-foreground">
                  Your design is used as the card background (portrait, 2.125 × 3.375 in). Each registrant&apos;s photo,
                  name, details, and QR code are laid over it.
                </p>
              )}
            </section>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <DesignColorsField
                primary={config.primaryColor}
                secondary={config.secondaryColor}
                onChange={set}
                onReset={() => chooseDesign(config.template)}
              />
              <ImagePickerField
                label="Logo"
                hint="Leave empty to show an emblem with your organization's initials and name."
                value={config.logoUrl}
                uploading={uploading === "logo"}
                onUpload={(file) => void upload("logo", file)}
                onRemove={() => set({ logoUrl: undefined })}
              />
            </div>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Line under the name</Label>
                <Select
                  value={config.roleFieldKey ?? "fixed"}
                  onValueChange={(v) => set({ roleFieldKey: v === "fixed" ? undefined : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">The same text for everyone</SelectItem>
                    {textFields.map((f) => (
                      <SelectItem key={f.fieldKey} value={f.fieldKey}>
                        Answer to &quot;{f.label}&quot;
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={config.roleText}
                  maxLength={60}
                  placeholder="Participant"
                  onChange={(e) => set({ roleText: e.target.value })}
                  aria-label={config.roleFieldKey ? "Text when the answer is blank" : "Text under the name"}
                />
                {config.roleFieldKey && (
                  <p className="text-xs text-muted-foreground">This text is used when a registrant left the question blank.</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Photo on the card</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["field", "Registrant photo"],
                      ["flyer", "Event flyer"],
                      ["none", "No photo"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={config.photoSource === value ? "default" : "outline"}
                      onClick={() => set({ photoSource: value })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {config.photoSource === "field" && (
                  <>
                    <Select
                      value={config.photoFieldKey ?? "none"}
                      onValueChange={(v) => set({ photoFieldKey: v === "none" ? undefined : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose the photo question" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No photo question (show a silhouette)</SelectItem>
                        {photoFields.map((f) => (
                          <SelectItem key={f.fieldKey} value={f.fieldKey}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {photoFields.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Add an &quot;Image Upload&quot; question (e.g. &quot;Photo&quot;) to your form to use it here.
                      </p>
                    )}
                  </>
                )}
                {config.photoSource === "flyer" && (
                  <ImagePickerField
                    label="Event flyer or image"
                    hint="Shown in the photo frame on every card, for events where cards aren't personal photos."
                    value={config.flyerUrl}
                    uploading={uploading === "flyer"}
                    onUpload={(file) => void upload("flyer", file)}
                    onRemove={() => set({ flyerUrl: undefined })}
                  />
                )}
                {config.photoSource === "none" && (
                  <p className="text-xs text-muted-foreground">The photo frame shows each registrant&apos;s initials instead.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  You can also set a photo and a role for a single registrant from their registration page.
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-1.5">
              <Label htmlFor="roleOptions">Roles you can give registrants (one per line)</Label>
              <Textarea
                id="roleOptions"
                rows={3}
                value={(config.roleOptions ?? []).join("\n")}
                placeholder={"Participant\nVisitor\nInvitee\nChoir\nUsher\nPastor"}
                onChange={(e) => set({ roleOptions: e.target.value.split("\n").map((r) => r.trimStart()).slice(0, 30) })}
              />
              <p className="text-xs text-muted-foreground">
                On a registration&apos;s page you pick one of these (or type another) to print on that person&apos;s card,
                for example Participant, Visitor, Choir, Usher, or Pastor.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label>Details on the card (up to {MAX_VISIBLE_FIELDS}, after the ID number)</Label>
              <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border/70 p-3">
                {textFields.length === 0 && (
                  <p className="text-xs text-muted-foreground">No form fields yet. Build the form first.</p>
                )}
                {textFields.map((field) => (
                  <label key={field.fieldKey} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={config.visibleFields.includes(field.fieldKey)}
                      onCheckedChange={() => toggleField(field.fieldKey)}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-4 rounded-xl border border-border/70 p-4">
              <p className="text-sm font-semibold">Back of the card</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="idTerms">Terms and conditions (one per line)</Label>
                <Textarea
                  id="idTerms"
                  rows={4}
                  maxLength={600}
                  value={config.terms ?? ""}
                  onChange={(e) => set({ terms: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input placeholder="Phone" value={config.contactPhone ?? ""} onChange={(e) => set({ contactPhone: e.target.value })} aria-label="Contact phone" />
                <Input placeholder="Email" value={config.contactEmail ?? ""} onChange={(e) => set({ contactEmail: e.target.value })} aria-label="Contact email" />
                <Input placeholder="Website" value={config.contactWebsite ?? ""} onChange={(e) => set({ contactWebsite: e.target.value })} aria-label="Website" />
                <Input placeholder="Address" value={config.contactAddress ?? ""} onChange={(e) => set({ contactAddress: e.target.value })} aria-label="Address" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="idSignature">Signature line label</Label>
                <Input
                  id="idSignature"
                  maxLength={40}
                  value={config.signatureLabel}
                  onChange={(e) => set({ signatureLabel: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">Each design shows the contact details it has room for.</p>
            </section>

            <section className="flex flex-col gap-2">
              <Label>What&apos;s on the card</Label>
              <ContentChecklist
                items={[
                  { key: "showRegistrationNumber", label: "Registration number" },
                  { key: "showRole", label: "Role line under the name" },
                  { key: "showQrCode", label: "Verification QR code" },
                  { key: "showBarcode", label: "Barcode", hint: "On designs that print one" },
                  { key: "showDates", label: "Issue and expiry dates" },
                  { key: "showTerms", label: "Terms and conditions" },
                  { key: "showContact", label: "Contact details" },
                  { key: "showSignature", label: "Signature line" },
                ]}
                values={config}
                onChange={(key, checked) => set({ [key]: checked })}
              />
            </section>

            <ShowOnConfirmationToggle
              id="idCardShowOnConfirmation"
              checked={config.showOnConfirmation}
              onChange={(checked) => set({ showOnConfirmation: checked })}
              thing="ID card"
            />

            <Button onClick={handleSave} loading={updateConfig.isPending} className="w-fit">
              {updateConfig.isPending ? "Saving..." : "Save ID card design"}
            </Button>
          </div>

          <div className="flex flex-col items-center gap-3 xl:sticky xl:top-20 xl:self-start">
            <div className="flex rounded-full border border-border p-0.5 text-xs font-medium">
              {(["front", "back"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={cn(
                    "rounded-full px-4 py-1 capitalize transition-colors",
                    side === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <IdCardPreview config={config} context={context} side={side} />
            <p className="text-center text-xs text-muted-foreground">Sample details. Downloads use each registrant&apos;s own.</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
