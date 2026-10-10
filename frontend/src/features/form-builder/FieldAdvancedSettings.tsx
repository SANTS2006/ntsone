import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConditionalRule, FieldConfig, FollowUp } from "@/types/api";
import type { EditableField } from "./types";

type UpdateConfig = (patch: Partial<FieldConfig>) => void;

const NONE = "__none";
const SINGLE_CHOICE_TYPES = new Set(["single_choice", "dropdown", "gender", "country"]);
const TEXT_INPUT_TYPES: Record<string, string> = {
  short_text: "text",
  long_text: "text",
  address: "text",
  email: "email",
  phone: "tel",
  url: "url",
  number: "number",
  currency: "number",
  rating: "number",
  date: "date",
  date_of_birth: "date",
  time: "time",
  datetime: "datetime-local",
};

/** Pre-fills the answer on the live form; the registrant can still change it. */
export function DefaultValueEditor({ draft, updateConfig }: { draft: EditableField; updateConfig: UpdateConfig }) {
  const value = draft.config.defaultValue;
  const options = draft.config.options ?? [];
  let input: React.ReactNode = null;

  if (SINGLE_CHOICE_TYPES.has(draft.type)) {
    input = (
      <Select
        value={typeof value === "string" && options.includes(value) ? value : NONE}
        onValueChange={(v) => updateConfig({ defaultValue: v === NONE ? undefined : v })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No default</SelectItem>
          {options.filter(Boolean).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (draft.type === "multiple_choice") {
    const selected = Array.isArray(value) ? value : [];
    input = (
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        {options.filter(Boolean).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(option)}
              onCheckedChange={(checked) => {
                const next = checked ? [...selected, option] : selected.filter((o) => o !== option);
                updateConfig({ defaultValue: next.length ? next : undefined });
              }}
            />
            {option}
          </label>
        ))}
        {options.length === 0 && <p className="text-xs text-muted-foreground">Add options first.</p>}
      </div>
    );
  } else if (draft.type === "yes_no") {
    input = (
      <Select
        value={value === true ? "yes" : value === false ? "no" : NONE}
        onValueChange={(v) => updateConfig({ defaultValue: v === NONE ? undefined : v === "yes" })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No default</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    );
  } else if (TEXT_INPUT_TYPES[draft.type]) {
    const inputType = TEXT_INPUT_TYPES[draft.type]!;
    input = (
      <Input
        type={inputType}
        placeholder="No default"
        value={value === undefined || Array.isArray(value) || typeof value === "boolean" ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) return updateConfig({ defaultValue: undefined });
          updateConfig({ defaultValue: inputType === "number" ? Number(raw) : raw });
        }}
      />
    );
  }

  if (!input) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Default value (optional)</Label>
      {input}
      <p className="text-xs text-muted-foreground">Pre-filled on the form; registrants can still change it.</p>
    </div>
  );
}

const DATE_TYPES = new Set(["date", "date_of_birth", "datetime"]);

/** The earliest and latest date a person may enter; dates of birth can limit age instead. */
export function DateLimitEditor({ draft, updateConfig }: { draft: EditableField; updateConfig: UpdateConfig }) {
  if (!DATE_TYPES.has(draft.type)) return null;
  const { minDate, maxDate } = draft.config;
  const isDob = draft.type === "date_of_birth";
  const dateValue = (v: string | undefined) => (v && v !== "today" ? v : "");
  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <p className="text-sm font-medium">Limit the date</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="min-date">Earliest date allowed</Label>
          <Input
            id="min-date"
            type="date"
            value={dateValue(minDate)}
            disabled={minDate === "today"}
            onChange={(e) => updateConfig({ minDate: e.target.value || undefined })}
          />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={minDate === "today"} onCheckedChange={(c) => updateConfig({ minDate: c === true ? "today" : undefined })} />
            No dates in the past (today or later)
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="max-date">Latest date allowed</Label>
          <Input
            id="max-date"
            type="date"
            value={dateValue(maxDate)}
            disabled={maxDate === "today"}
            onChange={(e) => updateConfig({ maxDate: e.target.value || undefined })}
          />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={maxDate === "today"} onCheckedChange={(c) => updateConfig({ maxDate: c === true ? "today" : undefined })} />
            No dates in the future (today or earlier)
          </label>
        </div>
      </div>
      {isDob && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="min-age">Youngest age allowed (years)</Label>
            <Input
              id="min-age"
              type="number"
              min={0}
              placeholder="No limit"
              value={draft.config.minAge ?? ""}
              onChange={(e) => updateConfig({ minAge: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max-age">Oldest age allowed (years)</Label>
            <Input
              id="max-age"
              type="number"
              min={0}
              placeholder="No limit"
              value={draft.config.maxAge ?? ""}
              onChange={(e) => updateConfig({ maxAge: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
            />
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {isDob ? "For example, set the youngest age to 18 so nobody younger can register." : "Dates outside this range are refused, and the date picker greys them out."}
      </p>
    </div>
  );
}

const NO_AUTOFILL_TYPES = new Set(["image_upload", "pdf_upload", "document_upload", "consent"]);

/** Fills this field from the answer given to another field, until the person types in it themselves. */
export function AutoFillEditor({ draft, otherFields, updateConfig }: { draft: EditableField; otherFields: EditableField[]; updateConfig: UpdateConfig }) {
  if (NO_AUTOFILL_TYPES.has(draft.type)) return null;
  const sources = otherFields.filter((f) => !NO_AUTOFILL_TYPES.has(f.type) && f.fieldKey !== draft.fieldKey && f.config.autoFillFrom !== draft.fieldKey);
  if (sources.length === 0 && !draft.config.autoFillFrom) return null;
  const current = draft.config.autoFillFrom;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-3">
      <Label>Fill this in automatically (optional)</Label>
      <Select value={current ?? NONE} onValueChange={(v) => updateConfig({ autoFillFrom: v === NONE ? undefined : v })}>
        <SelectTrigger aria-label="Fill from another question">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Don&apos;t fill automatically</SelectItem>
          {sources.map((f) => (
            <SelectItem key={f.fieldKey} value={f.fieldKey}>
              Copy from: {f.label || f.fieldKey}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        This answer is copied from the chosen question as it is filled in. The person can still change it, and it stops following once they do.
      </p>
    </div>
  );
}

const FOLLOW_UP_TYPES = new Set(["single_choice", "dropdown", "yes_no", "gender", "country", "multiple_choice"]);

const FOLLOW_UP_MODES: { value: FollowUp["mode"]; label: string }[] = [
  { value: "short_text", label: "Short text (one line)" },
  { value: "text", label: "Paragraph (long text)" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email address" },
  { value: "phone", label: "Phone number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown (you list the choices)" },
  { value: "file", label: "File upload" },
  { value: "text_or_file", label: "Paragraph or file upload" },
];

/** The most options a person may tick on a multiple choice question. */
export function MaxSelectionsEditor({ draft, updateConfig }: { draft: EditableField; updateConfig: UpdateConfig }) {
  if (draft.type !== "multiple_choice") return null;
  const count = (draft.config.options ?? []).filter(Boolean).length;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="max-selections">Limit how many can be selected (optional)</Label>
      <Input
        id="max-selections"
        type="number"
        min={1}
        max={count || undefined}
        placeholder="No limit"
        value={draft.config.maxSelections ?? ""}
        onChange={(e) => updateConfig({ maxSelections: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })}
      />
      <p className="text-xs text-muted-foreground">For example, enter 2 to let people pick no more than two options.</p>
    </div>
  );
}

/**
 * Lets an option ask for more, e.g. "Do you have a design in mind?" -> Yes shows a box to describe
 * or upload the design, No shows nothing.
 */
export function FollowUpEditor({ draft, otherFields, updateConfig }: { draft: EditableField; otherFields: EditableField[]; updateConfig: UpdateConfig }) {
  if (!FOLLOW_UP_TYPES.has(draft.type)) return null;
  const choices = draft.type === "yes_no" ? ["Yes", "No"] : (draft.config.options ?? []).filter((o) => o.trim() && !/^other/i.test(o.trim()));
  if (choices.length === 0) return null;
  const followUps = draft.config.followUps ?? {};

  const setFollowUp = (option: string, next: FollowUp | undefined) => {
    const copy = { ...followUps };
    if (next) copy[option] = next;
    else delete copy[option];
    updateConfig({ followUps: Object.keys(copy).length ? copy : undefined });
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <p className="text-sm font-medium">Ask for more details</p>
      <p className="-mt-2 text-xs text-muted-foreground">
        Turn this on for an option to show an extra input when it is chosen, and decide what kind of input it is. Options left off show nothing extra.
        {draft.type === "multiple_choice" ? " On a multiple choice question, every ticked option shows its own input." : ""}
      </p>
      {choices.map((option) => {
        const followUp = followUps[option];
        return (
          <div key={option} className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(followUp)}
                onCheckedChange={(checked) => setFollowUp(option, checked === true ? { mode: "text", label: "" } : undefined)}
              />
              When “{option}” is chosen, ask for more
            </label>
            {followUp && (
              <div className="ml-6 flex flex-col gap-2">
                <Select value={followUp.mode} onValueChange={(mode) => setFollowUp(option, { ...followUp, mode: mode as FollowUp["mode"] })}>
                  <SelectTrigger aria-label={`What to ask for when ${option} is chosen`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_UP_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`Prompt shown when ${option} is chosen`}
                  placeholder="What should they enter? e.g. Describe or upload your design"
                  value={followUp.label ?? ""}
                  onChange={(e) => setFollowUp(option, { ...followUp, label: e.target.value })}
                />
                {followUp.mode === "dropdown" && (
                  <Textarea
                    rows={3}
                    aria-label={`Choices shown when ${option} is chosen`}
                    placeholder="One choice per line"
                    defaultValue={(followUp.options ?? []).join("\n")}
                    onChange={(e) => setFollowUp(option, { ...followUp, options: linesToOptions(e.target.value) })}
                  />
                )}
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={followUp.required === true} onCheckedChange={(checked) => setFollowUp(option, { ...followUp, required: checked === true })} />
                  Required
                </label>
                <ConditionalLogicEditor
                  rules={followUp.conditions}
                  ownerKey={draft.fieldKey}
                  otherFields={otherFields}
                  onChange={(conditions) => setFollowUp(option, { ...followUp, conditions })}
                  heading="Ask this only when… (optional)"
                  hint="Show this extra input only when another answer matches, or when another question is filled in or left empty."
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function linesToOptions(text: string): string[] {
  return [...new Set(text.split("\n").map((line) => line.trim()).filter(Boolean))];
}

/**
 * Cascading options, e.g. District -> Chiefdom: pick the parent question, then
 * list this field's choices for each of the parent's answers.
 */
export function DependentOptionsEditor({
  draft,
  otherFields,
  updateConfig,
}: {
  draft: EditableField;
  otherFields: EditableField[];
  updateConfig: UpdateConfig;
}) {
  const dep = draft.config.optionsDependOn;
  const candidates = otherFields.filter(
    (f) => SINGLE_CHOICE_TYPES.has(f.type) && (f.config.options?.length ?? 0) > 0 && f.config.optionsDependOn?.fieldKey !== draft.fieldKey,
  );
  const parent = candidates.find((f) => f.fieldKey === dep?.fieldKey);

  const setDependency = (next: FieldConfig["optionsDependOn"]) =>
    updateConfig({
      optionsDependOn: next,
      // Keep the flat option list in sync so previews, defaults and analytics see every choice.
      options: next ? [...new Set(Object.values(next.map).flat())] : draft.config.options,
    });

  if (candidates.length === 0 && !dep) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={Boolean(dep)}
          onCheckedChange={(checked) => {
            if (!checked) return setDependency(undefined);
            const first = candidates[0];
            if (first) setDependency({ fieldKey: first.fieldKey, map: {} });
          }}
        />
        Filter these options based on another answer
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">
        For example, only show the chiefdoms that belong to the district the registrant picked. Once the options are listed, you can also make any option ask for more information below.
      </p>

      {dep && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Depends on</Label>
            <Select value={dep.fieldKey} onValueChange={(fieldKey) => setDependency({ fieldKey, map: {} })}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a question" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((f) => (
                  <SelectItem key={f.fieldKey} value={f.fieldKey}>
                    {f.label || f.fieldKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parent ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Enter the options for each answer to “{parent.label}”, one per line.
              </p>
              {(parent.config.options ?? []).map((parentOption) => (
                <div key={`${dep.fieldKey}:${parentOption}`} className="flex flex-col gap-1">
                  <Label className="text-xs">When “{parentOption}” is chosen</Label>
                  {/* Uncontrolled so blank lines survive while typing; parsed into options on every change. */}
                  <Textarea
                    rows={3}
                    defaultValue={(dep.map[parentOption] ?? []).join("\n")}
                    placeholder="One option per line"
                    onChange={(e) =>
                      setDependency({ ...dep, map: { ...dep.map, [parentOption]: linesToOptions(e.target.value) } })
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-destructive">The question this depends on no longer exists. Choose another.</p>
          )}
        </>
      )}
    </div>
  );
}

const OPERATORS: { value: ConditionalRule["operator"]; label: string; needsValue: boolean }[] = [
  { value: "equals", label: "is", needsValue: true },
  { value: "not_equals", label: "is not", needsValue: true },
  { value: "contains", label: "includes", needsValue: true },
  { value: "is_not_empty", label: "is filled in", needsValue: false },
  { value: "is_empty", label: "is left empty", needsValue: false },
];

/** The answers a person can give to a question, when it has a fixed list. */
function answerChoices(field: EditableField): { value: string; label: string }[] | null {
  if (field.type === "yes_no") return [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
  const options = (field.config.options ?? []).filter(Boolean);
  return options.length ? options.map((o) => ({ value: o, label: o })) : null;
}

/** Show this question only when other answers match. Works for every kind of question. */
export function ConditionalLogicEditor({
  rules: current,
  ownerKey,
  otherFields,
  onChange,
  heading = "Show this question only when… (optional)",
  hint = "Hide this question until another answer matches. With more than one rule, all of them must match.",
}: {
  rules: ConditionalRule[] | undefined;
  /** The question these rules belong to; it can't be checked against itself. */
  ownerKey: string;
  otherFields: EditableField[];
  onChange: (rules: ConditionalRule[] | undefined) => void;
  heading?: string;
  hint?: string;
}) {
  const rules = current ?? [];
  // A question can't wait on one that already waits on it.
  const sources = otherFields.filter(
    (f) => f.fieldKey !== ownerKey && !(f.conditionalLogic ?? []).some((r) => r.fieldKey === ownerKey),
  );
  if (sources.length === 0 && rules.length === 0) return null;

  const setRule = (index: number, patch: Partial<ConditionalRule>) =>
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const removeRule = (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    onChange(next.length ? next : undefined);
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <Label>{heading}</Label>
      <p className="-mt-2 text-xs text-muted-foreground">{hint}</p>
      {rules.map((rule, index) => {
        const source = sources.find((f) => f.fieldKey === rule.fieldKey) ?? otherFields.find((f) => f.fieldKey === rule.fieldKey);
        const choices = source ? answerChoices(source) : null;
        const operator = OPERATORS.find((o) => o.value === rule.operator) ?? OPERATORS[0]!;
        return (
          <div key={index} className="flex flex-col gap-2 rounded-md bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <Select
                value={rule.fieldKey}
                onValueChange={(fieldKey) => setRule(index, { fieldKey, value: "" })}
              >
                <SelectTrigger aria-label="Question to check" className="flex-1">
                  <SelectValue placeholder="Choose a question" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((f) => (
                    <SelectItem key={f.fieldKey} value={f.fieldKey}>
                      {f.label || f.fieldKey}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove this rule" onClick={() => removeRule(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={operator.needsValue ? "answer" : "filled"}
                onValueChange={(kind) => setRule(index, kind === "answer" ? { operator: "equals", value: "" } : { operator: "is_not_empty", value: undefined })}
              >
                <SelectTrigger aria-label="What to check" className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="answer">The answer given</SelectItem>
                  <SelectItem value="filled">Whether it is filled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={rule.operator} onValueChange={(op) => setRule(index, { operator: op as ConditionalRule["operator"] })}>
                <SelectTrigger aria-label="Condition" className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.filter((o) => o.needsValue === operator.needsValue).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {operator.needsValue &&
                (choices ? (
                  <Select value={String(rule.value ?? "") || undefined} onValueChange={(value) => setRule(index, { value })}>
                    <SelectTrigger aria-label="Answer" className="flex-1">
                      <SelectValue placeholder="Choose an answer" />
                    </SelectTrigger>
                    <SelectContent>
                      {choices.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    aria-label="Answer"
                    placeholder="The answer to look for"
                    value={String(rule.value ?? "")}
                    onChange={(e) => setRule(index, { value: e.target.value })}
                    className="flex-1"
                  />
                ))}
            </div>
          </div>
        );
      })}
      {sources.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...rules, { fieldKey: sources[0]!.fieldKey, operator: "equals", value: "" }])}
        >
          <Plus className="h-4 w-4" />
          {rules.length === 0 ? "Add a rule" : "Add another rule"}
        </Button>
      )}
    </div>
  );
}

/** Lets each choice be offered only when conditions match, e.g. show "Kono" only when Region is North. */
export function OptionConditionsEditor({
  draft,
  otherFields,
  updateConfig,
}: {
  draft: EditableField;
  otherFields: EditableField[];
  updateConfig: UpdateConfig;
}) {
  const options = (draft.config.options ?? []).filter((o) => o.trim());
  const [opened, setOpened] = React.useState<Set<string>>(() => new Set(Object.keys(draft.config.optionConditions ?? {})));
  if (draft.config.optionsDependOn || options.length < 2) return null;
  const all = draft.config.optionConditions ?? {};
  const setFor = (option: string, rules: ConditionalRule[] | undefined) => {
    const copy = { ...all };
    if (rules && rules.length) copy[option] = rules;
    else delete copy[option];
    updateConfig({ optionConditions: Object.keys(copy).length ? copy : undefined });
  };
  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <p className="text-sm font-medium">Offer an option only when…</p>
      <p className="-mt-2 text-xs text-muted-foreground">
        Hide individual choices until another answer matches, or another question is filled in or left empty. Options without rules are always offered.
      </p>
      {options.map((option) => (
        <div key={option} className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={opened.has(option)}
              onCheckedChange={(checked) => {
                const next = new Set(opened);
                if (checked === true) next.add(option);
                else {
                  next.delete(option);
                  setFor(option, undefined);
                }
                setOpened(next);
              }}
            />
            Add conditions to “{option}”
          </label>
          {opened.has(option) && (
            <div className="ml-6">
              <ConditionalLogicEditor
                rules={all[option]}
                ownerKey={draft.fieldKey}
                otherFields={otherFields}
                onChange={(rules) => setFor(option, rules)}
                heading={`Offer “${option}” only when…`}
                hint="All rules must match for this option to be offered."
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
