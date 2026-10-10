import * as React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { AutoFillEditor, ConditionalLogicEditor, OptionConditionsEditor, DateLimitEditor, DefaultValueEditor, DependentOptionsEditor, FollowUpEditor, MaxSelectionsEditor } from "./FieldAdvancedSettings";
import { metaFor } from "./fieldTypes";
import type { EditableField } from "./types";
import { slugifyKey } from "@/lib/utils";

const FILE_TYPE_PRESETS: Record<string, string[]> = {
  image_upload: ["image/jpeg", "image/png", "image/webp"],
  pdf_upload: ["application/pdf"],
  document_upload: ["application/pdf", "application/msword", "image/jpeg", "image/png"],
};

export function FieldSettingsDialog({
  field,
  otherFields,
  usedKeys,
  onSave,
  onClose,
}: {
  field: EditableField;
  otherFields: EditableField[];
  usedKeys: Set<string>;
  onSave: (field: EditableField) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState<EditableField>(field);
  // Keys start auto-generated from the field TYPE's default label (e.g. "short_text"), not the
  // admin's chosen label. Keep auto-deriving the key from the label until the admin edits the key
  // field directly, otherwise renaming "Short Text" to "Full Name" would silently keep "short_text".
  const [keyTouched, setKeyTouched] = React.useState(false);
  const meta = metaFor(draft.type);
  const keyConflict = draft.fieldKey !== field.fieldKey && usedKeys.has(draft.fieldKey);

  const update = (patch: Partial<EditableField>) => setDraft((d) => ({ ...d, ...patch }));
  const updateConfig = (patch: Partial<EditableField["config"]>) =>
    setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));

  const options = draft.config.options ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Field settings &middot; {meta.label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Label</Label>
            <Input
              value={draft.label}
              onChange={(e) => {
                const label = e.target.value;
                update({ label, fieldKey: keyTouched ? draft.fieldKey : slugifyKey(label) });
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Field key (used internally, must be unique)</Label>
            <Input
              value={draft.fieldKey}
              onChange={(e) => {
                setKeyTouched(true);
                update({ fieldKey: slugifyKey(e.target.value) });
              }}
            />
            {keyConflict && <p className="text-sm text-destructive">This key is already used by another field.</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea value={draft.description ?? ""} onChange={(e) => update({ description: e.target.value })} rows={2} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Placeholder</Label>
              <Input value={draft.placeholder ?? ""} onChange={(e) => update({ placeholder: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Help text</Label>
              <Input value={draft.helpText ?? ""} onChange={(e) => update({ helpText: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="required" checked={draft.required} onCheckedChange={(v) => update({ required: v === true })} />
            <Label htmlFor="required" className="font-normal">
              Required field
            </Label>
          </div>

          {draft.required && (
            <ConditionalLogicEditor
              rules={draft.config.requiredConditions}
              ownerKey={draft.fieldKey}
              otherFields={otherFields}
              onChange={(requiredConditions) => updateConfig({ requiredConditions })}
              heading="Make it required only when… (optional)"
              hint="Leave this empty to always require it. Otherwise it is only required when another answer matches, or when another question is filled in or left empty."
            />
          )}

          {(draft.type === "short_text" || draft.type === "long_text" || draft.type === "address") && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Min length</Label>
                <Input
                  type="number"
                  value={draft.config.minLength ?? ""}
                  onChange={(e) => updateConfig({ minLength: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Max length</Label>
                <Input
                  type="number"
                  value={draft.config.maxLength ?? ""}
                  onChange={(e) => updateConfig({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Regex (optional)</Label>
                <Input value={draft.config.regex ?? ""} onChange={(e) => updateConfig({ regex: e.target.value || undefined })} />
              </div>
            </div>
          )}

          {(draft.type === "number" || draft.type === "currency" || draft.type === "rating") && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Minimum</Label>
                <Input
                  type="number"
                  value={draft.config.minNumber ?? ""}
                  onChange={(e) => updateConfig({ minNumber: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Maximum</Label>
                <Input
                  type="number"
                  value={draft.config.maxNumber ?? ""}
                  onChange={(e) => updateConfig({ maxNumber: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
          )}

          {meta.hasOptions && (
            <DependentOptionsEditor draft={draft} otherFields={otherFields} updateConfig={updateConfig} />
          )}

          {meta.hasOptions && !draft.config.optionsDependOn && (
            <div className="flex flex-col gap-2">
              <Label>Options</Label>
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={(e) => {
                      const next = [...options];
                      next[index] = e.target.value;
                      updateConfig({ options: next });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove option ${index + 1}`}
                    onClick={() => updateConfig({ options: options.filter((_, i) => i !== index) })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => updateConfig({ options: [...options, `Option ${options.length + 1}`] })}
              >
                <Plus className="h-4 w-4" />
                Add option
              </Button>
              <p className="text-xs text-muted-foreground">
                Tip: an option that starts with “Other” (e.g. “Other (please specify)”) asks registrants to type their
                answer when they choose it.
              </p>
              {draft.type === "multiple_choice" && (
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="allowMultiple"
                    checked={draft.config.allowMultiple ?? true}
                    onCheckedChange={(v) => updateConfig({ allowMultiple: v === true })}
                  />
                  <Label htmlFor="allowMultiple" className="font-normal">
                    Allow multiple selections
                  </Label>
                </div>
              )}
            </div>
          )}

          {["minLength", "maxLength", "regex", "minNumber", "maxNumber", "minDate", "maxDate", "minAge", "maxAge", "maxSelections"].some(
            (key) => (draft.config as Record<string, unknown>)[key] !== undefined && (draft.config as Record<string, unknown>)[key] !== "",
          ) && (
            <ConditionalLogicEditor
              rules={draft.config.limitConditions}
              ownerKey={draft.fieldKey}
              otherFields={otherFields}
              onChange={(limitConditions) => updateConfig({ limitConditions })}
              heading="Apply this question's limits only when… (optional)"
              hint="Leave empty to always apply them. Otherwise the length, number, date, age and selection limits only apply when another answer matches, or when another question is filled in or left empty."
            />
          )}
          {meta.hasOptions && <OptionConditionsEditor draft={draft} otherFields={otherFields} updateConfig={updateConfig} />}
          {(draft.description?.trim() || draft.helpText?.trim()) && (
            <ConditionalLogicEditor
              rules={draft.config.descriptionConditions}
              ownerKey={draft.fieldKey}
              otherFields={otherFields}
              onChange={(descriptionConditions) => updateConfig({ descriptionConditions })}
              heading="Show the description and help text only when… (optional)"
              hint="Leave empty to always show them."
            />
          )}
          <DateLimitEditor draft={draft} updateConfig={updateConfig} />
          <MaxSelectionsEditor draft={draft} updateConfig={updateConfig} />
          {meta.hasOptions && (draft.config.options ?? []).some((o) => /^other\b/i.test(o.trim())) && (
            <ConditionalLogicEditor
              rules={draft.config.otherConditions}
              ownerKey={draft.fieldKey}
              otherFields={otherFields}
              onChange={(otherConditions) => updateConfig({ otherConditions })}
              heading={'Ask for the "Other" answer only when… (optional)'}
              hint={'The "Please specify" box shows only when another answer matches, or when another question is filled in or left empty.'}
            />
          )}
          <FollowUpEditor draft={draft} otherFields={otherFields} updateConfig={updateConfig} />

          <AutoFillEditor draft={draft} otherFields={otherFields} updateConfig={updateConfig} />
          {draft.config.autoFillFrom && (
            <ConditionalLogicEditor
              rules={draft.config.autoFillConditions}
              ownerKey={draft.fieldKey}
              otherFields={otherFields}
              onChange={(autoFillConditions) => updateConfig({ autoFillConditions })}
              heading="Copy the answer only when… (optional)"
              hint="Leave empty to always copy. Otherwise it is only copied when another answer matches, or when another question is filled in or left empty."
            />
          )}

          <DefaultValueEditor draft={draft} updateConfig={updateConfig} />
          {draft.config.defaultValue !== undefined && (
            <ConditionalLogicEditor
              rules={draft.config.defaultConditions}
              ownerKey={draft.fieldKey}
              otherFields={otherFields}
              onChange={(defaultConditions) => updateConfig({ defaultConditions })}
              heading="Pre-fill the default only when… (optional)"
              hint="Leave empty to always pre-fill it. Otherwise it is only pre-filled when another answer matches, or when another question is filled in or left empty."
            />
          )}

          {meta.isFile && (
            <div className="flex flex-col gap-1.5">
              <Label>Max file size (MB)</Label>
              <Input
                type="number"
                value={draft.config.maxFileSizeMb ?? 5}
                onChange={(e) => updateConfig({ maxFileSizeMb: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Accepted types: {(FILE_TYPE_PRESETS[draft.type] ?? []).join(", ")}
              </p>
            </div>
          )}

          <ConditionalLogicEditor rules={draft.conditionalLogic} ownerKey={draft.fieldKey} otherFields={otherFields} onChange={(conditionalLogic) => update({ conditionalLogic })} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!draft.label.trim() || !draft.fieldKey.trim() || keyConflict}
            onClick={() => onSave(draft)}
          >
            Save field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
