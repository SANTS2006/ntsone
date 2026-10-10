import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import type { Program, Registration } from "@/types/api";
import { DesignSvg } from "../designs/DesignSvg";
import { fetchDocumentSvg } from "../designs/documentImage";
import { updateDocumentOverrides, uploadIdCardBackground } from "./api";
import { useIdCardConfig } from "./hooks";

const CUSTOM = "__custom";
const CARD_DEFAULT = "__default";

/**
 * This registrant's own ID card: the role printed under their name (e.g. Participant,
 * Visitor, Choir, Usher, Pastor) and, if needed, a different photo. Shows the real card.
 */
export function RegistrantIdCardPanel({
  program,
  registration,
  canEdit,
}: {
  program: Program;
  registration: Registration;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: cardConfig } = useIdCardConfig(program.id);
  const overrides = registration.documentOverrides ?? {};
  const roleOptions = cardConfig?.config.roleOptions ?? [];

  const [role, setRole] = React.useState(overrides.role ?? "");
  const [choice, setChoice] = React.useState(() =>
    !overrides.role ? CARD_DEFAULT : roleOptions.includes(overrides.role) ? overrides.role : CUSTOM,
  );
  const [photoUrl, setPhotoUrl] = React.useState<string | undefined>(overrides.photoUrl);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [side, setSide] = React.useState<"front" | "back">("front");
  const [preview, setPreview] = React.useState<{ front: string; back: string } | null>(null);
  const [version, setVersion] = React.useState(0);

  // Once the presets load, show a saved preset role as selected rather than "custom".
  const presetsKey = roleOptions.join("|");
  React.useEffect(() => {
    if (overrides.role && presetsKey.split("|").includes(overrides.role)) setChoice(overrides.role);
  }, [presetsKey, overrides.role]);

  React.useEffect(() => {
    let cancelled = false;
    const base = `/programs/${program.id}/registrations/${registration.id}/id-card?format=svg`;
    Promise.all([fetchDocumentSvg(`${base}&side=front`, true), fetchDocumentSvg(`${base}&side=back`, true)])
      .then(([front, back]) => !cancelled && setPreview({ front: front.svg, back: back.svg }))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [program.id, registration.id, version]);

  const chosenRole = choice === CARD_DEFAULT ? "" : choice === CUSTOM ? role.trim() : choice;
  const dirty = chosenRole !== (overrides.role ?? "") || (photoUrl ?? "") !== (overrides.photoUrl ?? "");

  const save = async () => {
    setSaving(true);
    try {
      await updateDocumentOverrides(program.id, registration.id, {
        role: chosenRole || null,
        photoUrl: photoUrl || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["registrations", program.id, "detail", registration.id] });
      setVersion((v) => v + 1);
      toast.success("ID card updated for this registrant");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update the ID card");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      setPhotoUrl(await uploadIdCardBackground(program.id, file));
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ID card for this registrant</CardTitle>
        <CardDescription>
          {canEdit ? "Set the role on their card and, if needed, a different photo." : "Their card as it downloads."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          {preview ? (
            <DesignSvg
              svg={preview[side]}
              label={`ID card, ${side}`}
              className="w-full max-w-[200px] rounded-xl shadow-lg ring-1 ring-black/5"
            />
          ) : (
            <div className="aspect-[300/476] w-full max-w-[200px] animate-pulse rounded-xl bg-muted" />
          )}
          <div className="flex rounded-full border border-border p-0.5 text-xs font-medium">
            {(["front", "back"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`rounded-full px-3 py-0.5 capitalize ${side === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {canEdit && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Role on the card</Label>
              <Select value={choice} onValueChange={setChoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CARD_DEFAULT}>Use the card&apos;s usual line</SelectItem>
                  {roleOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Something else...</SelectItem>
                </SelectContent>
              </Select>
              {choice === CUSTOM && (
                <Input value={role} maxLength={40} placeholder="e.g. Choir Director" onChange={(e) => setRole(e.target.value)} />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Photo for this registrant</Label>
              <div className="flex flex-wrap items-center gap-2">
                {photoUrl && <img src={photoUrl} alt="" className="h-12 w-12 rounded-md border border-border object-cover" />}
                <Button variant="outline" size="sm" className="relative" loading={uploading}>
                  {photoUrl ? <ImagePlus className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  {photoUrl ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPhoto(file);
                      e.target.value = "";
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </Button>
                {photoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setPhotoUrl(undefined)}>
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Leave empty to use the photo the card normally shows.</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={save} loading={saving} disabled={!dirty} className="flex-1">
                Save for this registrant
              </Button>
              {(overrides.role || overrides.photoUrl) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setChoice(CARD_DEFAULT);
                    setRole("");
                    setPhotoUrl(undefined);
                  }}
                  aria-label="Reset to the card's usual role and photo"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
