import { Loading } from "@/components/Loading";
import { ConditionalLogicEditor } from "./FieldAdvancedSettings";
import type { ConditionalRule } from "@/types/api";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Eye, Hash, Plus, Save, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { useProgramOutletContext } from "../programs/ProgramDetailLayout";
import { getAdminForm, publishForm, saveFormDraft } from "./api";
import { FIELD_TYPE_GROUPS, FIELD_TYPE_META, smartDefaultConfig } from "./fieldTypes";
import { SortableFieldRow } from "./SortableFieldRow";
import { FieldSettingsDialog } from "./FieldSettingsDialog";
import { ShareFormCard } from "./ShareFormCard";
import { PaymentSettingsCard } from "../payments/PaymentSettingsCard";
import { fromEditable, OrderItemsEditor, toEditable, type EditableItem } from "../payments/OrderItemsEditor";
import type { EditableField, EditableSection, FormLayoutMode } from "./types";
import { DynamicForm } from "../public-registration/DynamicForm";
import { FormCoverHeader } from "../public-registration/FormCoverHeader";
import type { FieldType, FormField, FormSection } from "@/types/api";

function makeUniqueKey(base: string, used: Set<string>) {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  return candidate;
}

export function FormBuilderPage() {
  const { program } = useProgramOutletContext();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["form-builder", program.id], queryFn: () => getAdminForm(program.id) });

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [confirmationMessage, setConfirmationMessage] = React.useState("");
  const [requireConsent, setRequireConsent] = React.useState(false);
  const [consentText, setConsentText] = React.useState("");
  const [consentConditions, setConsentConditions] = React.useState<ConditionalRule[] | undefined>(undefined);
  const [showRegistrationNumber, setShowRegistrationNumber] = React.useState(true);
  const [registrationNumberConditions, setRegistrationNumberConditions] = React.useState<ConditionalRule[] | undefined>(undefined);
  const [reviewConfirmEnabled, setReviewConfirmEnabled] = React.useState(true);
  const [reviewConfirmText, setReviewConfirmText] = React.useState("");
  const [reviewConfirmConditions, setReviewConfirmConditions] = React.useState<ConditionalRule[] | undefined>(undefined);
  const [orderItems, setOrderItems] = React.useState<EditableItem[]>([]);
  const [layoutMode, setLayoutMode] = React.useState<FormLayoutMode>("stepped");
  const [sections, setSections] = React.useState<EditableSection[]>([]);
  const [fields, setFields] = React.useState<EditableField[]>([]);
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewWidth, setPreviewWidth] = React.useState<"desktop" | "tablet" | "mobile">("desktop");
  const [addingType, setAddingType] = React.useState<Record<string, FieldType | undefined>>({});

  React.useEffect(() => {
    if (!data) return;
    setTitle(data.form.title);
    setDescription(data.form.description ?? "");
    setInstructions(data.form.instructions ?? "");
    setConfirmationMessage(data.form.confirmationMessage ?? "");
    setRequireConsent(data.form.requireConsent);
    setConsentText(data.form.consentText ?? "");
    setConsentConditions(data.form.consentConditions ?? undefined);
    setShowRegistrationNumber(data.form.showRegistrationNumber ?? true);
    setRegistrationNumberConditions(data.form.registrationNumberConditions ?? undefined);
    setReviewConfirmEnabled(data.form.reviewConfirmEnabled ?? true);
    setReviewConfirmText(data.form.reviewConfirmText ?? "");
    setReviewConfirmConditions(data.form.reviewConfirmConditions ?? undefined);
    setLayoutMode(data.form.layoutMode);
    setOrderItems(toEditable(data.form.orderItems ?? []));
    setSections(
      data.sections.map((s) => ({
        key: s.id,
        title: s.title,
        description: s.description ?? undefined,
        orderIndex: s.orderIndex,
        conditionalLogic: s.conditionalLogic ?? undefined,
      })),
    );
    setFields(
      data.fields.map((f) => ({
        fieldKey: f.fieldKey,
        sectionKey: f.sectionId,
        type: f.type,
        label: f.label,
        description: f.description ?? undefined,
        placeholder: f.placeholder ?? undefined,
        helpText: f.helpText ?? undefined,
        required: f.required,
        orderIndex: f.orderIndex,
        config: f.config,
        conditionalLogic: f.conditionalLogic ?? undefined,
      })),
    );
  }, [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (isLoading || !data) {
    return <Loading label="Loading form" />;
  }

  const canEdit = program.myRole === "admin";
  const usedKeys = new Set(fields.map((f) => f.fieldKey));
  const editingField = fields.find((f) => f.fieldKey === editingKey) ?? null;

  const fieldsForSection = (sectionKey: string | null) =>
    fields.filter((f) => f.sectionKey === sectionKey).sort((a, b) => a.orderIndex - b.orderIndex);

  const addSection = () => {
    const key = `section_${Date.now()}`;
    setSections((prev) => [...prev, { key, title: `Section ${prev.length + 1}`, orderIndex: prev.length }]);
  };

  const removeSection = (key: string) => {
    setSections((prev) => prev.filter((s) => s.key !== key));
    setFields((prev) => prev.map((f) => (f.sectionKey === key ? { ...f, sectionKey: null } : f)));
  };

  const addField = (sectionKey: string | null, type: FieldType) => {
    const meta = FIELD_TYPE_META.find((m) => m.type === type)!;
    const baseKey = meta.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const fieldKey = makeUniqueKey(baseKey || "field", usedKeys);
    const orderIndex = fieldsForSection(sectionKey).length;
    setFields((prev) => [
      ...prev,
      {
        fieldKey,
        sectionKey,
        type,
        label: meta.label,
        required: false,
        orderIndex,
        config: smartDefaultConfig(type),
      },
    ]);
    setEditingKey(fieldKey);
  };

  const deleteField = (fieldKey: string) => setFields((prev) => prev.filter((f) => f.fieldKey !== fieldKey));

  const saveField = (updated: EditableField) => {
    setFields((prev) => prev.map((f) => (f.fieldKey === editingKey ? updated : f)));
    setEditingKey(null);
  };

  const onDragEnd = (sectionKey: string | null) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sectionFields = fieldsForSection(sectionKey);
    const oldIndex = sectionFields.findIndex((f) => f.fieldKey === active.id);
    const newIndex = sectionFields.findIndex((f) => f.fieldKey === over.id);
    const reordered = arrayMove(sectionFields, oldIndex, newIndex).map((f, i) => ({ ...f, orderIndex: i }));
    setFields((prev) => [...prev.filter((f) => f.sectionKey !== sectionKey), ...reordered]);
  };

  const buildPayload = () => ({
    title,
    description: description || undefined,
    instructions: instructions || undefined,
    confirmationMessage: confirmationMessage || undefined,
    requireConsent,
    consentText: consentText || undefined,
    consentConditions: requireConsent ? consentConditions : undefined,
    showRegistrationNumber,
    registrationNumberConditions: showRegistrationNumber ? registrationNumberConditions : undefined,
    reviewConfirmEnabled,
    reviewConfirmText: reviewConfirmText.trim() || undefined,
    reviewConfirmConditions: reviewConfirmEnabled ? reviewConfirmConditions : undefined,
    layoutMode,
    orderItems: program.kind === "order_form" ? fromEditable(orderItems).items : undefined,
    sections: sections.map((s) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      orderIndex: s.orderIndex,
      conditionalLogic: s.conditionalLogic,
    })),
    fields,
  });

  /** The items for sale must be complete before anything is saved. */
  const itemsProblem = () => {
    if (program.kind !== "order_form") return null;
    return fromEditable(orderItems).error ?? null;
  };

  const handleSave = async () => {
    const problem = itemsProblem();
    if (problem) return void toast.error(problem);
    setSaving(true);
    try {
      await saveFormDraft(program.id, buildPayload());
      await queryClient.invalidateQueries({ queryKey: ["form-builder", program.id] });
      toast.success("Draft saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    const problem = itemsProblem();
    if (problem) return void toast.error(problem);
    setPublishing(true);
    try {
      await saveFormDraft(program.id, buildPayload());
      await publishForm(program.id);
      await queryClient.invalidateQueries({ queryKey: ["form-builder", program.id] });
      await queryClient.invalidateQueries({ queryKey: ["form-share", program.id] });
      toast.success("Form published");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to publish form");
    } finally {
      setPublishing(false);
    }
  };

  const previewFields: FormField[] = fields.map((f, i) => ({
    id: f.fieldKey,
    formId: "preview",
    sectionId: f.sectionKey,
    fieldKey: f.fieldKey,
    type: f.type,
    label: f.label,
    description: f.description ?? null,
    placeholder: f.placeholder ?? null,
    helpText: f.helpText ?? null,
    required: f.required,
    orderIndex: i,
    config: f.config,
    conditionalLogic: f.conditionalLogic ?? null,
  }));
  const previewSections: FormSection[] = sections.map((s) => ({
    id: s.key,
    formId: "preview",
    title: s.title,
    description: s.description ?? null,
    orderIndex: s.orderIndex,
    conditionalLogic: s.conditionalLogic ?? null,
  }));

  const renderSectionCard = (section: EditableSection | null) => {
    const sectionKey = section?.key ?? null;
    const sectionFields = fieldsForSection(sectionKey);

    return (
      <Card key={sectionKey ?? "unassigned"}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          {section ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Input
                value={section.title}
                onChange={(e) =>
                  setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, title: e.target.value } : s)))
                }
                className="w-full font-medium sm:max-w-sm"
              />
              <Textarea
                value={section.description ?? ""}
                placeholder="Section description (optional)"
                rows={1}
                onChange={(e) =>
                  setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, description: e.target.value } : s)))
                }
              />
              <ConditionalLogicEditor
                rules={section.conditionalLogic}
                ownerKey=""
                // A section can't wait on a question inside itself.
                otherFields={fields.filter((f) => f.sectionKey !== section.key)}
                onChange={(conditionalLogic) =>
                  setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, conditionalLogic } : s)))
                }
                heading="Show this section only when… (optional)"
                hint="Hide the whole section until another answer matches, or another question is filled in or left empty. A section with no visible questions is skipped automatically."
              />
            </div>
          ) : (
            <CardTitle className="text-base">Unassigned fields</CardTitle>
          )}
          {section && (
            <Button variant="ghost" size="icon" aria-label="Delete section" onClick={() => removeSection(section.key)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(sectionKey)}>
            <SortableContext items={sectionFields.map((f) => f.fieldKey)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {sectionFields.map((field) => (
                  <SortableFieldRow
                    key={field.fieldKey}
                    field={field}
                    onEdit={() => setEditingKey(field.fieldKey)}
                    onDelete={() => deleteField(field.fieldKey)}
                  />
                ))}
                {sectionFields.length === 0 && (
                  <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    No fields yet. Add one below.
                  </p>
                )}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select
              value={addingType[sectionKey ?? "root"] ?? ""}
              onValueChange={(v) => setAddingType((prev) => ({ ...prev, [sectionKey ?? "root"]: v as FieldType }))}
            >
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue placeholder="Choose a field type to add" />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_GROUPS.map((group) => (
                  <React.Fragment key={group}>
                    {FIELD_TYPE_META.filter((m) => m.group === group).map((m) => (
                      <SelectItem key={m.type} value={m.type}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const type = addingType[sectionKey ?? "root"];
                if (!type) return;
                addField(sectionKey, type);
              }}
            >
              <Plus className="h-4 w-4" />
              Add field
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const unassignedFields = fieldsForSection(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={data.form.status === "published" ? "success" : "secondary"}>{data.form.status}</Badge>
          <span className="text-sm text-muted-foreground">Version {data.form.version}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" onClick={handleSave} loading={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button onClick={handlePublish} loading={publishing} disabled={fields.length === 0}>
                <UploadCloud className="h-4 w-4" />
                {publishing ? "Publishing..." : "Publish"}
              </Button>
            </>
          )}
        </div>
      </div>

      <ShareFormCard programId={program.id} programName={program.name} />

      {!canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">You have view-only access to this form.</p>
          </CardHeader>
          <CardContent>
            <DynamicForm
              sections={previewSections}
              fields={previewFields}
              layoutMode={layoutMode}
              requireConsent={requireConsent}
              requireReviewConfirmation={reviewConfirmEnabled}
              reviewConfirmText={reviewConfirmText}
              reviewConfirmConditions={reviewConfirmConditions}
              consentConditions={consentConditions}
              consentText={consentText}
              onSubmit={async () => undefined}
            />
          </CardContent>
        </Card>
      ) : (
      <>
      {program.kind === "order_form" && (
        <>
          <PaymentSettingsCard program={program} />
          <OrderItemsEditor items={orderItems} onChange={setOrderItems} />
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Form settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Form title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Instructions</Label>
            <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Confirmation message</Label>
            <Textarea value={confirmationMessage} onChange={(e) => setConfirmationMessage(e.target.value)} rows={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Form layout</Label>
            <Select value={layoutMode} onValueChange={(v) => setLayoutMode(v as FormLayoutMode)}>
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stepped">Step by step (one section at a time)</SelectItem>
                <SelectItem value="single">Single page (show all fields at once)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="requireConsent" className="flex min-w-0 items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Require consent before submitting
              </Label>
              <Switch id="requireConsent" className="shrink-0" checked={requireConsent} onCheckedChange={setRequireConsent} />
            </div>
            {requireConsent && (
              <div className="flex flex-col gap-1.5">
                <Label>Consent message shown to applicants</Label>
                <Textarea
                  value={consentText}
                  onChange={(e) => setConsentText(e.target.value)}
                  rows={3}
                  placeholder="e.g. By registering, you agree to share this information with the program organizers..."
                />
                <p className="text-xs text-muted-foreground">Shown with a checkbox just before the submit button, after the questions.</p>
                <ConditionalLogicEditor
                  rules={consentConditions}
                  ownerKey=""
                  otherFields={fields}
                  onChange={setConsentConditions}
                  heading="Ask for consent only when… (optional)"
                  hint="Leave empty to always ask. Otherwise consent is only asked when another answer matches, or when another question is filled in or left empty."
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="reviewConfirmEnabled" className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Ask applicants to confirm their answers
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  A checkbox before the submit button: &ldquo;I have gone through the entire form&hellip;&rdquo;. Turn it off to remove it.
                </p>
              </div>
              <Switch id="reviewConfirmEnabled" className="shrink-0" checked={reviewConfirmEnabled} onCheckedChange={setReviewConfirmEnabled} />
            </div>
            {reviewConfirmEnabled && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reviewConfirmText">Message shown next to the checkbox</Label>
                  <Textarea
                    id="reviewConfirmText"
                    value={reviewConfirmText}
                    onChange={(e) => setReviewConfirmText(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="I have gone through the entire form and confirm that all the information I entered is complete and correct."
                  />
                  <p className="text-xs text-muted-foreground">Leave empty to use the standard message.</p>
                </div>
                <ConditionalLogicEditor
                  rules={reviewConfirmConditions}
                  ownerKey=""
                  otherFields={fields}
                  onChange={setReviewConfirmConditions}
                  heading="Ask for this confirmation only when… (optional)"
                  hint="Leave empty to always ask. Otherwise it is only asked when another answer matches, or when another question is filled in or left empty."
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-3">
            <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="showRegistrationNumber" className="flex items-center gap-2 font-medium">
                <Hash className="h-4 w-4 text-primary" />
                Show registration number on the success page
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                When off, registrants still get their number by email, but it isn&apos;t displayed after submitting.
              </p>
            </div>
            <Switch id="showRegistrationNumber" className="shrink-0" checked={showRegistrationNumber} onCheckedChange={setShowRegistrationNumber} />
            </div>
            {showRegistrationNumber && (
              <ConditionalLogicEditor
                rules={registrationNumberConditions}
                ownerKey=""
                otherFields={fields}
                onChange={setRegistrationNumberConditions}
                heading="Show the number only when… (optional)"
                hint="Leave empty to always show it. Otherwise it is shown only when another answer matches, or when another question is filled in or left empty."
              />
            )}
          </div>
        </CardContent>
      </Card>

      {sections.map((section) => renderSectionCard(section))}
      {(sections.length === 0 || unassignedFields.length > 0) && renderSectionCard(null)}

      <Button variant="outline" onClick={addSection} className="w-fit">
        <Plus className="h-4 w-4" />
        Add section
      </Button>
      </>
      )}

      {canEdit && editingField && (
        <FieldSettingsDialog
          field={editingField}
          otherFields={fields.filter((f) => f.fieldKey !== editingField.fieldKey)}
          usedKeys={usedKeys}
          onSave={saveField}
          onClose={() => setEditingKey(null)}
        />
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <div className="flex gap-2 pt-2">
              {(["desktop", "tablet", "mobile"] as const).map((size) => (
                <Button
                  key={size}
                  size="sm"
                  variant={previewWidth === size ? "default" : "outline"}
                  onClick={() => setPreviewWidth(size)}
                >
                  {size[0]!.toUpperCase() + size.slice(1)}
                </Button>
              ))}
            </div>
          </DialogHeader>
          <div
            className="mx-auto w-full overflow-hidden rounded-md border border-border"
            style={{ maxWidth: previewWidth === "mobile" ? 375 : previewWidth === "tablet" ? 640 : "100%" }}
          >
            <FormCoverHeader name={program.name} thumbnailUrl={program.thumbnailUrl} description={program.description} />
            <div className="p-4">
              <h2 className="mb-1 text-lg font-semibold">{title}</h2>
              {description && <p className="mb-4 text-sm text-muted-foreground">{description}</p>}
              <DynamicForm
                sections={previewSections}
                fields={previewFields}
                layoutMode={layoutMode}
                requireConsent={requireConsent}
              requireReviewConfirmation={reviewConfirmEnabled}
              reviewConfirmText={reviewConfirmText}
              reviewConfirmConditions={reviewConfirmConditions}
              consentConditions={consentConditions}
                consentText={consentText}
                onSubmit={async () => undefined}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
