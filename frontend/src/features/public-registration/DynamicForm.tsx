import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ChevronLeft, ChevronRight, Eraser, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import type { ConditionalRule, FollowUp, FormField, FormSection, OrderItem } from "@/types/api";
import { formatMinor } from "@/lib/money";
import { OrderItemsPicker, selectionList, selectionTotal, type Selection } from "./OrderItemsPicker";

const followUpAsksFile = (mode: FollowUp["mode"]) => mode === "file" || mode === "text_or_file";
const followUpAsksText = (mode: FollowUp["mode"]) => mode !== "file";

/** Why a follow-up answer doesn't fit the kind of input the admin chose, if it doesn't. */
function followUpFormatProblem(followUp: FollowUp, text: string): string | null {
  if (!text) return null;
  if (followUp.mode === "number") return !Number.isFinite(Number(text)) ? "must be a number" : Number(text) < 0 ? "can't be negative" : null;
  if (followUp.mode === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? null : "must be a valid email address";
  if (followUp.mode === "phone") return /^[+()\d\s.-]{5,25}$/.test(text) ? null : "must be a valid phone number";
  return null;
}
import { cn } from "@/lib/utils";

export interface UploadedFileInfo {
  fieldKey: string;
  url: string;
  publicId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface DynamicFormProps {
  sections: FormSection[];
  fields: FormField[];
  onSubmit: (
    responses: Record<string, unknown>,
    files: UploadedFileInfo[],
    consentAccepted: boolean,
    items?: { itemId: string; quantity: number }[],
    /** The registrant will buy their ID card or ticket in person at the program instead of paying for it online. */
    documentsInPerson?: boolean,
  ) => Promise<void>;
  /** An order form's goods: the customer picks quantities and sees the total. */
  orderItems?: OrderItem[];
  /** What a registration costs (fee, ID card, ticket), shown before the registrant submits and pays. */
  payment?: { enabled: boolean; allowPayInPerson?: boolean; currency?: string; lines: { id: string; name: string; amountMinor: number }[] };
  onUploadFile?: (file: File, fieldKey: string) => Promise<UploadedFileInfo>;
  submitting?: boolean;
  errors?: string[];
  submitLabel?: string;
  layoutMode?: "stepped" | "single";
  /** Starts the form with these answers filled in (editing an existing registration). */
  initialValues?: Record<string, unknown>;
  /** Missing required answers do not stop saving; wrong ones still do. */
  lenient?: boolean;
  requireConsent?: boolean;
  /** Consent is only asked when these rules match the answers. */
  consentConditions?: ConditionalRule[] | null;
  consentText?: string | null;
  onCancel?: () => void;
  /** Asks the person to confirm they checked their answers before the form can be submitted. */
  requireReviewConfirmation?: boolean;
  /** The admin's own wording for the confirmation checkbox; the standard message when empty. */
  reviewConfirmText?: string | null;
  /** The confirmation is only asked when these rules match the answers. */
  reviewConfirmConditions?: ConditionalRule[] | null;
  /** When set, answers are kept in this browser so a refresh doesn't lose them; cleared on submit or "Clear form". */
  storageKey?: string;
  /** Shows a summary of the answers to confirm before the form is actually submitted. */
  reviewBeforeSubmit?: boolean;
}

interface SavedDraft {
  selection?: Selection;
  responses: Record<string, unknown>;
  files: Record<string, UploadedFileInfo>;
  step: number;
}

function loadDraft(key: string | undefined): SavedDraft | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedDraft;
    return parsed && typeof parsed.responses === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Forgets a saved draft, e.g. once the form has been submitted. */
export function clearSavedDraft(key: string | undefined) {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage can be blocked; nothing to clear */
  }
}

/** What the person is about to pay, line by line, and the total. */
function ChargeSummary({ lines, total, heading = "To pay" }: { lines: { id: string; name: string; amountMinor: number }[]; total: number; heading?: string }) {
  return (
    <section aria-label={heading} className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-gradient-brand-soft p-4 text-sm">
      <h3 className="font-semibold">{heading}</h3>
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{line.name}</span>
            <span className="shrink-0 font-medium">{formatMinor(line.amountMinor)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-primary/20 pt-2 text-base font-bold">
        <span>Total</span>
        <span>{formatMinor(total)}</span>
      </div>
      <p className="text-xs text-muted-foreground">You&apos;ll pay on the next page with Orange Money, Africell Money or QMoney. Your registration is held until the payment is confirmed.</p>
    </section>
  );
}

const DOCUMENT_LINE_IDS = new Set(["id_card", "ticket"]);

/** Lets a registrant pay for their ID card or ticket now, or just register and buy them in person at the program. */
function DocumentPaymentChoice({
  lines,
  value,
  onChange,
}: {
  lines: { id: string; name: string; amountMinor: number }[];
  value: "online" | "in_person";
  onChange: (next: "online" | "in_person") => void;
}) {
  const names = lines.map((l) => l.name).join(" and ");
  const amount = formatMinor(lines.reduce((sum, l) => sum + l.amountMinor, 0));
  const options = [
    { id: "online" as const, title: `Pay for my ${names} now`, text: `${amount} online with mobile money. Your ${names} is ready as soon as the payment is confirmed.` },
    { id: "in_person" as const, title: `I will buy my ${names} in person`, text: `Just register now. You pay ${amount} for your ${names} at the program, and it is given to you there.` },
  ];
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-primary/25 p-4">
      <legend className="px-1 text-sm font-semibold">How would you like to get your {names}?</legend>
      {options.map((option) => (
        <label
          key={option.id}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${value === option.id ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40"}`}
        >
          <input type="radio" name="document-payment" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={value === option.id} onChange={() => onChange(option.id)} />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{option.title}</span>
            <span className="text-xs text-muted-foreground">{option.text}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const REVIEW_REQUIRED_MESSAGE = "Please confirm you have checked all your answers before submitting";

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function evaluateRule(rule: ConditionalRule, responses: Record<string, unknown>): boolean {
  const actual = responses[rule.fieldKey];
  switch (rule.operator) {
    case "equals":
      // eslint-disable-next-line eqeqeq
      return String(actual) == String(rule.value);
    case "not_equals":
      return String(actual) !== String(rule.value);
    case "contains":
      return Array.isArray(actual) ? actual.includes(rule.value) : String(actual ?? "").includes(String(rule.value ?? ""));
    case "is_empty":
      return isEmpty(actual);
    case "is_not_empty":
      return !isEmpty(actual);
    default:
      return true;
  }
}

function isVisible(field: FormField, responses: Record<string, unknown>) {
  if (!field.conditionalLogic || field.conditionalLogic.length === 0) return true;
  return field.conditionalLogic.every((rule) => evaluateRule(rule, responses));
}

const FILE_TYPES = new Set(["image_upload", "pdf_upload", "document_upload"]);
const NUMBER_TYPES = new Set(["number", "currency", "rating"]);

/** Options like "Other" or "Other (please specify)" ask the registrant to type their own answer. */
export function isOtherOption(option: string) {
  return /^other\b/i.test(option.trim());
}

export function otherTextKey(fieldKey: string) {
  return `${fieldKey}__other`;
}

/** Multiple choice: the key one ticked option's extra answer (or file) is kept under. */
export function optionFollowKey(fieldKey: string, option: string) {
  return `${fieldKey}__fu__${option}`;
}

/** Required, unless the admin made it required only when certain other answers match. */
function isRequired(field: FormField, responses: Record<string, unknown>): boolean {
  return field.required && (field.config.requiredConditions ?? []).every((rule) => evaluateRule(rule, responses));
}

/** A question's description and help text only show when the admin's rules for them match. */
function showHelp(field: FormField, responses: Record<string, unknown>): boolean {
  return (field.config.descriptionConditions ?? []).every((rule) => evaluateRule(rule, responses));
}

/** The "Other" text box only shows when the admin's rules for it match the answers so far. */
function otherApplies(field: FormField, responses: Record<string, unknown>): boolean {
  return (field.config.otherConditions ?? []).every((rule) => evaluateRule(rule, responses));
}

/** The extra inputs the ticked options of a multiple choice question ask for. */
function followUpsForMulti(field: FormField, value: unknown, responses: Record<string, unknown>): { option: string; followUp: FollowUp }[] {
  if (field.type !== "multiple_choice" || !Array.isArray(value)) return [];
  const configured = field.config.followUps ?? {};
  return value
    .map(String)
    .flatMap((option) => (configured[option] && followUpApplies(configured[option]!, responses) ? [{ option, followUp: configured[option]! }] : []));
}

/** An extra input only shows when the admin's rules for it match the answers so far. */
function followUpApplies(followUp: FollowUp, responses: Record<string, unknown>): boolean {
  return (followUp.conditions ?? []).every((rule) => evaluateRule(rule, responses));
}

/** What the chosen option asks for on top of the choice itself, if the admin turned that on. */
function followUpFor(field: FormField, value: unknown, responses: Record<string, unknown>): FollowUp | null {
  if (!["single_choice", "dropdown", "yes_no", "gender", "country"].includes(field.type)) return null;
  const key = typeof value === "boolean" ? (value ? "Yes" : "No") : typeof value === "string" ? value : "";
  const followUp = field.config.followUps?.[key] ?? null;
  return followUp && followUpApplies(followUp, responses) ? followUp : null;
}

/** The choices to show right now -- narrowed by the parent's answer for cascading fields. */
function optionsFor(field: FormField, responses: Record<string, unknown>): string[] {
  const rules = field.config.optionConditions ?? {};
  // An option the admin hid behind conditions is only offered while its conditions match.
  return baseOptionsFor(field, responses).filter((option) => (rules[option] ?? []).every((rule) => evaluateRule(rule, responses)));
}

function baseOptionsFor(field: FormField, responses: Record<string, unknown>): string[] {
  const dep = field.config.optionsDependOn;
  if (!dep) return field.config.options ?? [];
  const parentValue = responses[dep.fieldKey];
  return isEmpty(parentValue) ? [] : (dep.map[String(parentValue)] ?? []);
}

/** Drops answers a changed parent no longer allows, following chains (region -> district -> chiefdom). */
function pruneDependentAnswers(fields: FormField[], responses: Record<string, unknown>) {
  const next = { ...responses };
  let changed = true;
  while (changed) {
    changed = false;
    for (const field of fields) {
      if ((!field.config.optionsDependOn && !field.config.optionConditions) || isEmpty(next[field.fieldKey])) continue;
      const allowed = optionsFor(field, next);
      const current = next[field.fieldKey];
      if (Array.isArray(current)) {
        const kept = current.filter((v) => allowed.includes(String(v)));
        if (kept.length !== current.length) {
          next[field.fieldKey] = kept;
          changed = true;
        }
      } else if (!allowed.includes(String(current))) {
        delete next[field.fieldKey];
        changed = true;
      }
    }
  }
  return next;
}

function initialResponses(fields: FormField[]): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  for (const field of fields) {
    const value = field.config.defaultValue;
    if (value === undefined || value === "" || FILE_TYPES.has(field.type)) continue;
    // A default with conditions waits until they match (see applyConditionalDefaults).
    if ((field.config.defaultConditions ?? []).length > 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (field.type === "multiple_choice") responses[field.fieldKey] = Array.isArray(value) ? value : [String(value)];
    else if (field.type === "yes_no") responses[field.fieldKey] = value === true || value === "true" || value === "yes";
    else if (field.type === "consent") responses[field.fieldKey] = value === true || value === "true";
    else if (NUMBER_TYPES.has(field.type)) responses[field.fieldKey] = Number(value);
    else responses[field.fieldKey] = Array.isArray(value) ? value[0] : String(value);
  }
  return pruneDependentAnswers(fields, responses);
}

const LIMIT_KEYS = ["minLength", "maxLength", "regex", "minNumber", "maxNumber", "minDate", "maxDate", "minAge", "maxAge", "maxSelections"] as const;

/** The question's settings, without its limits when the admin made them apply only under conditions that aren't met. */
function limitsFor(field: FormField, responses: Record<string, unknown>): FormField["config"] {
  const rules = field.config.limitConditions ?? [];
  if (rules.every((rule) => evaluateRule(rule, responses))) return field.config;
  const config = { ...field.config };
  for (const key of LIMIT_KEYS) delete config[key];
  return config;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The earliest and latest day a date field accepts right now, from its limits and (for birth dates) age range. */
function dateBounds(field: FormField, responses: Record<string, unknown>): { min?: string; max?: string } {
  const { minDate, maxDate, minAge, maxAge } = limitsFor(field, responses);
  const today = new Date();
  const resolve = (v: string | undefined) => (v === "today" ? ymd(today) : v);
  let min = resolve(minDate);
  let max = resolve(maxDate);
  if (field.type === "date_of_birth") {
    if (typeof minAge === "number") {
      const youngest = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
      const day = ymd(youngest);
      if (!max || day < max) max = day;
    }
    if (typeof maxAge === "number") {
      const oldest = new Date(today.getFullYear() - maxAge - 1, today.getMonth(), today.getDate() + 1);
      const day = ymd(oldest);
      if (!min || day > min) min = day;
    }
  }
  return { min, max };
}

function dateProblem(field: FormField, value: unknown, responses: Record<string, unknown>): string | null {
  if (!["date", "date_of_birth", "datetime"].includes(field.type) || typeof value !== "string" || !value) return null;
  const day = value.slice(0, 10);
  const { min, max } = dateBounds(field, responses);
  if (min && day < min) return `${field.label} can't be earlier than ${min}`;
  if (max && day > max) return `${field.label} can't be later than ${max}`;
  return null;
}

/** An answer copied from another field, in the shape the target field expects (or undefined to leave it empty). */
function autoFillValue(target: FormField, source: unknown): unknown {
  if (isEmpty(source)) return undefined;
  const options = target.config.options ?? [];
  switch (target.type) {
    case "multiple_choice": {
      const list = (Array.isArray(source) ? source : [source]).map(String);
      return list.filter((v) => !options.length || options.includes(v));
    }
    case "single_choice":
    case "dropdown":
    case "gender":
    case "country": {
      const value = Array.isArray(source) ? String(source[0] ?? "") : String(source);
      return !options.length || options.includes(value) ? value : undefined;
    }
    case "yes_no":
      return typeof source === "boolean" ? source : undefined;
    case "number":
    case "currency":
    case "rating":
      return Number.isNaN(Number(source)) ? undefined : Number(source);
    default:
      return Array.isArray(source) ? source.join(", ") : typeof source === "boolean" ? (source ? "Yes" : "No") : String(source);
  }
}

/** Copies a changed answer into every untouched field set to follow it, and onward through chains. */
function applyAutoFill(fields: FormField[], responses: Record<string, unknown>, changedKey: string, touched: Set<string>) {
  let next = responses;
  const queue = [changedKey];
  for (let guard = 0; queue.length && guard < 100; guard++) {
    const source = queue.shift()!;
    for (const field of fields) {
      const from = field.config.autoFillFrom;
      const conditions = field.config.autoFillConditions ?? [];
      // Runs when the question it copies changes, or when an answer its conditions look at changes.
      const relevant = from === source || (from !== undefined && conditions.some((rule) => rule.fieldKey === source));
      if (!from || !relevant || touched.has(field.fieldKey)) continue;
      if (!conditions.every((rule) => evaluateRule(rule, next))) continue;
      const value = autoFillValue(field, next[from]);
      if (JSON.stringify(value) === JSON.stringify(next[field.fieldKey])) continue;
      next = { ...next };
      if (value === undefined) delete next[field.fieldKey];
      else next[field.fieldKey] = value;
      queue.push(field.fieldKey);
    }
  }
  return next;
}

/** Defaults that wait for conditions are applied once the answers meet them, to questions still untouched and empty. */
function applyConditionalDefaults(fields: FormField[], responses: Record<string, unknown>, touched: Set<string>) {
  let next = responses;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const field of fields) {
      const conditions = field.config.defaultConditions ?? [];
      if (conditions.length === 0 || touched.has(field.fieldKey) || !isEmpty(next[field.fieldKey])) continue;
      if (!conditions.every((rule) => evaluateRule(rule, next))) continue;
      const value = initialResponses([{ ...field, config: { ...field.config, defaultConditions: undefined } }])[field.fieldKey];
      if (value === undefined) continue;
      next = { ...next, [field.fieldKey]: value };
      changed = true;
    }
    if (!changed) break;
  }
  return next;
}

function chosenOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? [value] : [];
}

export function DynamicForm({
  sections,
  fields,
  onSubmit,
  orderItems,
  payment,
  onUploadFile,
  submitting,
  errors,
  submitLabel,
  layoutMode = "stepped",
  initialValues,
  lenient = false,
  requireConsent = false,
  consentConditions,
  consentText,
  onCancel,
  requireReviewConfirmation = true,
  reviewConfirmText,
  reviewConfirmConditions,
  storageKey,
  reviewBeforeSubmit = false,
}: DynamicFormProps) {
  const orderedSections = [...sections].sort((a, b) => a.orderIndex - b.orderIndex);
  const hasSections = orderedSections.length > 0;
  const [consentChecked, setConsentChecked] = React.useState(false);
  const draft = React.useMemo(() => loadDraft(storageKey), [storageKey]);
  const [stepIndex, setStepIndex] = React.useState(() => Math.max(0, Math.min(draft?.step ?? 0, Math.max(0, sections.length - 1))));
  const [responses, setResponses] = React.useState<Record<string, unknown>>(() =>
    draft
      ? pruneDependentAnswers(fields, draft.responses)
      : initialValues
        ? pruneDependentAnswers(fields, initialValues)
        : applyConditionalDefaults(fields, initialResponses(fields), new Set()),
  );
  const [uploadedFiles, setUploadedFiles] = React.useState<Record<string, UploadedFileInfo>>(() => draft?.files ?? {});
  const [uploadingKey, setUploadingKey] = React.useState<string | null>(null);
  const [stepErrors, setStepErrors] = React.useState<string[]>([]);
  const errorBoxRef = React.useRef<HTMLDivElement>(null);
  const errorCount = (errors?.length ?? 0) + stepErrors.length;
  // The messages sit just above the submit button; make sure they are in view when they appear.
  React.useEffect(() => {
    if (errorCount > 0) errorBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [errorCount, errors, stepErrors]);
  const [reviewConfirmed, setReviewConfirmed] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const catalogue = orderItems ?? [];
  const [selection, setSelection] = React.useState<Selection>(() => draft?.selection ?? {});
  const [itemsMissing, setItemsMissing] = React.useState(false);
  const chosenCount = Object.values(selection).reduce((a, b) => a + b, 0);
  // What will be charged: an order's items, or the registration's fee, ID card and ticket.
  const documentLines = catalogue.length > 0 || !payment?.enabled ? [] : payment.lines.filter((l) => DOCUMENT_LINE_IDS.has(l.id) && l.amountMinor > 0);
  const canChooseInPerson = Boolean(payment?.allowPayInPerson) && documentLines.length > 0;
  const [documentChoice, setDocumentChoice] = React.useState<"online" | "in_person">("online");
  const documentsInPerson = canChooseInPerson && documentChoice === "in_person";
  const chargeLines =
    catalogue.length > 0
      ? catalogue.filter((i) => (selection[i.id] ?? 0) > 0).map((i) => ({ id: i.id, name: `${selection[i.id]} x ${i.name}`, amountMinor: i.priceMinor * (selection[i.id] ?? 0) }))
      : (payment?.enabled ? payment.lines.filter((l) => !(documentsInPerson && DOCUMENT_LINE_IDS.has(l.id))) : []);
  const chargeTotal = catalogue.length > 0 ? selectionTotal(catalogue, selection) : chargeLines.reduce((sum, l) => sum + l.amountMinor, 0);
  const willPay = Boolean(payment?.enabled) && chargeTotal > 0;

  const fieldsBySection = (sectionId: string | null) =>
    fields.filter((f) => f.sectionId === sectionId).sort((a, b) => a.orderIndex - b.orderIndex);

  const allGroups: { id: string | null; title: string; fields: FormField[]; conditions?: ConditionalRule[] | null }[] = hasSections
    ? orderedSections.map((s) => ({ id: s.id, title: s.title, fields: fieldsBySection(s.id), conditions: s.conditionalLogic }))
    : [{ id: null, title: "Registration", fields: fieldsBySection(null) }];

  const unassigned = fieldsBySection(null);
  if (hasSections && unassigned.length > 0) {
    allGroups.push({ id: "unassigned", title: "Additional Information", fields: unassigned });
  }

  // A section hidden by its conditions, or with no question left to show, is skipped entirely.
  const shownGroups = allGroups.filter(
    (g) => (g.conditions ?? []).every((rule) => evaluateRule(rule, responses)) && g.fields.some((f) => isVisible(f, responses)),
  );
  const groups = shownGroups.length > 0 ? shownGroups : allGroups;

  const isSingle = layoutMode === "single";
  // Consent is asked just before submitting, and only when its conditions match the answers so far.
  const reviewConfirmNeeded = requireReviewConfirmation && (reviewConfirmConditions ?? []).every((rule) => evaluateRule(rule, responses));
  const consentNeeded = requireConsent && (consentConditions ?? []).every((rule) => evaluateRule(rule, responses));
  const steps = isSingle ? [{ id: "all", title: "Registration", fields: groups.flatMap((g) => g.fields) }] : groups;
  const activeStep = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[activeStep]!;
  const isLastStep = activeStep === steps.length - 1;

  // Keep what the person has typed, so a refresh (or an accidental close) doesn't lose it.
  React.useEffect(() => {
    if (!storageKey) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ responses, files: uploadedFiles, step: stepIndex, selection } satisfies SavedDraft));
      } catch {
        /* storage full or blocked: the form still works, it just won't be remembered */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [storageKey, responses, uploadedFiles, stepIndex, selection]);

  // Empties every answer and upload at once, and returns to the first step.
  const clearForm = () => {
    clearSavedDraft(storageKey);
    touched.current.clear();
    setResponses({});
    setUploadedFiles({});
    setStepErrors([]);
    setStepIndex(0);
    setReviewConfirmed(false);
    setConsentChecked(false);
    setSelection({});
    setItemsMissing(false);
  };

  // Questions the person has typed in themselves no longer follow the question they copy from.
  const seed = draft?.responses ?? initialValues;
  const touched = React.useRef<Set<string>>(
    new Set(
      fields
        .filter((f) => f.config.autoFillFrom && seed && !isEmpty(seed[f.fieldKey]))
        .filter((f) => JSON.stringify(autoFillValue(f, seed![f.config.autoFillFrom!])) !== JSON.stringify(seed![f.fieldKey]))
        .map((f) => f.fieldKey),
    ),
  );

  const setValue = (key: string, value: unknown) => {
    touched.current.add(key);
    setResponses((r) =>
      applyConditionalDefaults(fields, pruneDependentAnswers(fields, applyAutoFill(fields, { ...r, [key]: value }, key, touched.current)), touched.current),
    );
  };

  const handleFileChange = async (field: FormField, file: File | undefined) => {
    if (!file || !onUploadFile) return;
    setUploadingKey(field.fieldKey);
    try {
      const uploaded = await onUploadFile(file, field.fieldKey);
      setUploadedFiles((prev) => ({ ...prev, [field.fieldKey]: uploaded }));
      setValue(field.fieldKey, uploaded.filename);
    } finally {
      setUploadingKey(null);
    }
  };

  const handleFollowUpFile = async (key: string, file: File | undefined) => {
    if (!file || !onUploadFile) return;
    setUploadingKey(key);
    try {
      const uploaded = await onUploadFile(file, key);
      setUploadedFiles((prev) => ({ ...prev, [key]: uploaded }));
    } finally {
      setUploadingKey(null);
    }
  };

  const validateFields = (fieldsToCheck: FormField[]): string[] => {
    const missing: string[] = [];
    for (const field of fieldsToCheck) {
      if (!isVisible(field, responses)) continue;
      if (!isRequired(field, responses)) continue;
      // Cascading field with no options for the parent's answer doesn't apply.
      if (field.config.optionsDependOn && optionsFor(field, responses).length === 0) continue;
      const isFile = field.type.endsWith("_upload");
      const hasValue = isFile ? !!uploadedFiles[field.fieldKey] : !isEmpty(responses[field.fieldKey]);
      if (!hasValue) missing.push(`${field.label} is required`);
    }
    for (const field of fieldsToCheck) {
      if (!isVisible(field, responses)) continue;
      const problem = dateProblem(field, responses[field.fieldKey], responses);
      if (problem) missing.push(problem);
    }
    for (const field of fieldsToCheck) {
      if (!isVisible(field, responses)) continue;
      const followUp = followUpFor(field, responses[field.fieldKey], responses);
      if (followUp?.required) {
        const key = otherTextKey(field.fieldKey);
        const hasText = !isEmpty(String(responses[key] ?? "").trim());
        const hasFile = !!uploadedFiles[key];
        const asksText = followUpAsksText(followUp.mode);
        const asksFile = followUpAsksFile(followUp.mode);
        const ok = asksText && asksFile ? hasText || hasFile : asksText ? hasText : hasFile;
        if (!ok) missing.push(`${field.label}: please provide ${followUp.label?.trim() || "more details"}`);
      }
      if (followUp && followUpAsksText(followUp.mode)) {
        const problem = followUpFormatProblem(followUp, String(responses[otherTextKey(field.fieldKey)] ?? "").trim());
        if (problem) missing.push(`${field.label}: ${followUp.label?.trim() || "your answer"} ${problem}`);
      }
    }
    for (const field of fieldsToCheck) {
      if (!isVisible(field, responses)) continue;
      for (const { option, followUp } of followUpsForMulti(field, responses[field.fieldKey], responses)) {
        const key = optionFollowKey(field.fieldKey, option);
        const text = String(responses[key] ?? "").trim();
        const asksText = followUpAsksText(followUp.mode);
        const asksFile = followUpAsksFile(followUp.mode);
        const hasFile = !!uploadedFiles[key];
        if (followUp.required) {
          const ok = asksText && asksFile ? !!text || hasFile : asksText ? !!text : hasFile;
          if (!ok) missing.push(`${field.label} (${option}): please provide ${followUp.label?.trim() || "more details"}`);
        }
        const problem = asksText ? followUpFormatProblem(followUp, text) : null;
        if (problem) missing.push(`${field.label} (${option}): ${followUp.label?.trim() || "your answer"} ${problem}`);
      }
    }
    for (const field of fieldsToCheck) {
      if (!isVisible(field, responses)) continue;
      const pickedOther = chosenOptions(responses[field.fieldKey]).some(isOtherOption) && otherApplies(field, responses);
      if (pickedOther && isEmpty(String(responses[otherTextKey(field.fieldKey)] ?? "").trim())) {
        missing.push(`Please specify your answer for ${field.label}`);
      }
    }
    // Editing an existing registration: answers still missing are allowed, wrong ones are not.
    return lenient ? missing.filter((m) => !/( is required$|: please provide |^Please specify your answer)/.test(m)) : missing;
  };

  const validateStep = (): boolean => {
    const missing = validateFields(currentStep.fields);
    // An order needs at least one item, asked on the step that shows the items.
    const needsItems = catalogue.length > 0 && (isSingle || activeStep === 0) && chosenCount === 0;
    setItemsMissing(needsItems);
    if (needsItems) missing.unshift("Choose at least one item to order");
    setStepErrors(missing);
    return missing.length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStepIndex(activeStep + 1);
  };

  const handleBack = () => setStepIndex(Math.max(0, activeStep - 1));

  const CONSENT_REQUIRED_MESSAGE = "Please agree to the consent statement before submitting";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;
    if (consentNeeded && !consentChecked) {
      setStepErrors([CONSENT_REQUIRED_MESSAGE]);
      return;
    }
    if (reviewConfirmNeeded && !reviewConfirmed) {
      setStepErrors([REVIEW_REQUIRED_MESSAGE]);
      return;
    }
    if (reviewBeforeSubmit && !reviewing) {
      setReviewing(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    await submitNow();
  };

  const submitNow = async () => {
    // Files from a follow-up box the person has since switched away from are not sent.
    const files = Object.entries(uploadedFiles)
      .filter(([key]) => {
        const at = key.indexOf("__fu__");
        if (at > 0) {
          const owner = fields.find((f) => f.fieldKey === key.slice(0, at));
          const asked = owner && isVisible(owner, responses) ? followUpsForMulti(owner, responses[owner.fieldKey], responses).find((x) => x.option === key.slice(at + 6)) : undefined;
          return asked !== undefined && followUpAsksFile(asked.followUp.mode);
        }
        if (!key.endsWith("__other")) {
          // A file question hidden by its conditions sends nothing.
          const fileOwner = fields.find((f) => f.fieldKey === key);
          return !fileOwner || isVisible(fileOwner, responses);
        }
        const owner = fields.find((f) => otherTextKey(f.fieldKey) === key);
        const mode = owner && isVisible(owner, responses) ? followUpFor(owner, responses[owner.fieldKey], responses)?.mode : undefined;
        return mode !== undefined && followUpAsksFile(mode);
      })
      .map(([, file]) => file);
    await onSubmit(responses, files, !consentNeeded || consentChecked, catalogue.length > 0 ? selectionList(catalogue, selection) : undefined, documentsInPerson || undefined);
  };

  const renderField = (field: FormField) => {
    if (!isVisible(field, responses)) return null;
    // A cascading question with nothing to pick for the chosen answer is left out entirely.
    const parentKey = field.config.optionsDependOn?.fieldKey;
    if (parentKey && !isEmpty(responses[parentKey]) && optionsFor(field, responses).length === 0) return null;
    const value = responses[field.fieldKey];

    return (
      <div key={field.fieldKey} className="flex flex-col gap-1.5">
        <Label htmlFor={field.fieldKey}>
          {field.label}
          {isRequired(field, responses) && <span className="text-destructive"> *</span>}
        </Label>
        {field.description && showHelp(field, responses) && <p className="text-xs text-muted-foreground">{field.description}</p>}

        {renderInput(field, value)}
        {renderOtherInput(field, value)}

        {field.helpText && showHelp(field, responses) && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      </div>
    );
  };

  /** Free-text box that appears right under a choice field when an "Other" option is picked. */
  const renderFollowUp = (field: FormField, followUp: FollowUp, key = otherTextKey(field.fieldKey), heading?: string) => {
    const asksText = followUpAsksText(followUp.mode);
    const asksFile = followUpAsksFile(followUp.mode);
    const prompt = followUp.label?.trim() || (asksFile && !asksText ? "Upload a file" : "Tell us more");
    const textValue = (responses[key] as string) ?? "";
    const setText = (v: string) => setResponses((r) => ({ ...r, [key]: v }));
    const inputType = ({ number: "number", email: "email", phone: "tel", date: "date" } as Record<string, string>)[followUp.mode];
    const uploaded = uploadedFiles[key];
    const isUploading = uploadingKey === key;
    return (
      <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
        <Label htmlFor={key} className="text-sm">
          {heading ? `${heading}: ` : ""}
          {prompt}
          {followUp.required && <span className="text-destructive"> *</span>}
        </Label>
        {asksText && followUp.mode === "dropdown" && (
          <Select value={textValue || undefined} onValueChange={setText}>
            <SelectTrigger id={key}>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {(followUp.options ?? []).map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {asksText && followUp.mode === "short_text" && <Input id={key} maxLength={300} value={textValue} onChange={(e) => setText(e.target.value)} />}
        {asksText && inputType && <Input id={key} type={inputType} maxLength={300} value={textValue} onChange={(e) => setText(e.target.value)} />}
        {asksText && (followUp.mode === "text" || followUp.mode === "text_or_file") && (
          <Textarea id={key} rows={3} maxLength={2000} value={textValue} onChange={(e) => setText(e.target.value)} />
        )}
        {asksFile && (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-4 py-4 text-sm text-muted-foreground hover:bg-muted">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isUploading ? "Uploading..." : uploaded ? uploaded.filename : asksText ? "Or upload a file" : "Click to upload a file"}
            <input type="file" className="sr-only" onChange={(e) => handleFollowUpFile(key, e.target.files?.[0])} />
          </label>
        )}
      </div>
    );
  };

  const renderOtherInput = (field: FormField, value: unknown) => {
    const followUp = followUpFor(field, value, responses);
    if (followUp) return renderFollowUp(field, followUp);
    const multi = followUpsForMulti(field, value, responses);
    const multiBoxes = multi.map(({ option, followUp: asks }) => (
      <React.Fragment key={option}>{renderFollowUp(field, asks, optionFollowKey(field.fieldKey, option), option)}</React.Fragment>
    ));
    if (!chosenOptions(value).some(isOtherOption) || !otherApplies(field, responses)) return multi.length > 0 ? <>{multiBoxes}</> : null;
    const key = otherTextKey(field.fieldKey);
    return (
      <>
        {multiBoxes}
        <Input
          id={key}
          aria-label={`${field.label}: please specify`}
          placeholder="Please specify"
          autoFocus
          maxLength={500}
          value={(responses[key] as string) ?? ""}
          onChange={(e) => setResponses((r) => ({ ...r, [key]: e.target.value }))}
          className="mt-1"
        />
      </>
    );
  };

  /** Shown in place of a cascading field's options until its parent has an answer. */
  const renderAwaitingParent = (field: FormField) => {
    const parent = fields.find((f) => f.fieldKey === field.config.optionsDependOn?.fieldKey);
    return (
      <p className="rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground">
        {isEmpty(responses[field.config.optionsDependOn!.fieldKey])
          ? `Select ${parent?.label ?? "the previous question"} first`
          : "No options available for your previous answer"}
      </p>
    );
  };

  const renderInput = (field: FormField, value: unknown) => {
    const common = {
      id: field.fieldKey,
      placeholder: field.placeholder ?? undefined,
      required: isRequired(field, responses),
    };
    if (field.config.optionsDependOn && optionsFor(field, responses).length === 0) {
      return renderAwaitingParent(field);
    }

    switch (field.type) {
      case "long_text":
      case "address":
        return <Textarea {...common} value={(value as string) ?? ""} onChange={(e) => setValue(field.fieldKey, e.target.value)} />;
      case "email":
        return (
          <Input {...common} type="email" value={(value as string) ?? ""} onChange={(e) => setValue(field.fieldKey, e.target.value)} />
        );
      case "phone":
        return (
          <Input {...common} type="tel" value={(value as string) ?? ""} onChange={(e) => setValue(field.fieldKey, e.target.value)} />
        );
      case "url":
        return (
          <Input {...common} type="url" value={(value as string) ?? ""} onChange={(e) => setValue(field.fieldKey, e.target.value)} />
        );
      case "number":
      case "currency":
      case "rating":
        return (
          <Input
            {...common}
            type="number"
            min={Math.max(0, limitsFor(field, responses).minNumber ?? 0)}
            max={limitsFor(field, responses).maxNumber}
            value={(value as number) ?? ""}
            onChange={(e) => setValue(field.fieldKey, e.target.value === "" ? "" : Number(e.target.value))}
          />
        );
      case "date":
      case "date_of_birth": {
        const { min, max } = dateBounds(field, responses);
        return (
          <Input {...common} type="date" min={min} max={max} value={(value as string) ?? ""} onChange={(e) => setValue(field.fieldKey, e.target.value)} />
        );
      }
      case "time":
        return (
          <Input {...common} type="time" value={(value as string) ?? ""} onChange={(e) => setValue(field.fieldKey, e.target.value)} />
        );
      case "datetime": {
        const { min, max } = dateBounds(field, responses);
        return (
          <Input
            {...common}
            type="datetime-local"
            min={min ? `${min}T00:00` : undefined}
            max={max ? `${max}T23:59` : undefined}
            value={(value as string) ?? ""}
            onChange={(e) => setValue(field.fieldKey, e.target.value)}
          />
        );
      }
      case "single_choice":
      case "gender":
      case "country":
        return (
          <div className="flex flex-col gap-2">
            {optionsFor(field, responses).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field.fieldKey}
                  checked={value === option}
                  onChange={() => setValue(field.fieldKey, option)}
                  className="h-4 w-4"
                />
                {option}
              </label>
            ))}
          </div>
        );
      case "dropdown":
        return (
          <Select value={(value as string) ?? ""} onValueChange={(v) => setValue(field.fieldKey, v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {optionsFor(field, responses).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multiple_choice": {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-col gap-2">
            {limitsFor(field, responses).maxSelections !== undefined && (
              <p className="text-xs text-muted-foreground">
                Choose up to {limitsFor(field, responses).maxSelections} ({selected.length} selected)
              </p>
            )}
            {optionsFor(field, responses).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(option)}
                  disabled={!selected.includes(option) && limitsFor(field, responses).maxSelections !== undefined && selected.length >= limitsFor(field, responses).maxSelections!}
                  onCheckedChange={(checked) => {
                    const next = checked ? [...selected, option] : selected.filter((o) => o !== option);
                    setValue(field.fieldKey, next);
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        );
      }
      case "yes_no":
        return (
          <div className="flex gap-4">
            {[
              { label: "Yes", val: true },
              { label: "No", val: false },
            ].map((opt) => (
              <label key={opt.label} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field.fieldKey}
                  checked={value === opt.val}
                  onChange={() => setValue(field.fieldKey, opt.val)}
                  className="h-4 w-4"
                />
                {opt.label}
              </label>
            ))}
          </div>
        );
      case "consent":
        return (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={value === true} onCheckedChange={(checked) => setValue(field.fieldKey, checked === true)} />
            <span>{field.label}</span>
          </label>
        );
      case "image_upload":
      case "pdf_upload":
      case "document_upload": {
        const uploaded = uploadedFiles[field.fieldKey];
        const isUploading = uploadingKey === field.fieldKey;
        return (
          <div className="flex flex-col gap-2">
            <label
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/40 px-4 py-6 text-sm text-muted-foreground hover:bg-muted",
              )}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {isUploading ? "Uploading..." : uploaded ? uploaded.filename : "Click to upload a file"}
              <input
                type="file"
                className="hidden"
                accept={field.type === "image_upload" ? "image/*" : undefined}
                onChange={(e) => handleFileChange(field, e.target.files?.[0])}
              />
            </label>
          </div>
        );
      }
      default:
        return (
          <Input {...common} value={(value as string) ?? ""} onChange={(e) => setValue(field.fieldKey, e.target.value)} />
        );
    }
  };

  const combinedErrors = [...(errors ?? []), ...stepErrors];

  /** What the person entered for a question, as plain text for the review screen. */
  const answerText = (field: FormField): string => {
    if (FILE_TYPES.has(field.type)) return uploadedFiles[field.fieldKey]?.filename ?? "";
    const value = responses[field.fieldKey];
    const extra = String(responses[otherTextKey(field.fieldKey)] ?? "").trim();
    const followUpFile = uploadedFiles[otherTextKey(field.fieldKey)]?.filename;
    if (isEmpty(value)) return "";
    const pieces = (Array.isArray(value) ? value.map(String) : [typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)]).map((v) => {
      if (isOtherOption(v) && extra && otherApplies(field, responses)) return `${v}: ${extra}`;
      if (Array.isArray(value) && field.config.followUps?.[v]) {
        const key = optionFollowKey(field.fieldKey, v);
        const more = [String(responses[key] ?? "").trim(), uploadedFiles[key] ? `[file: ${uploadedFiles[key]!.filename}]` : ""].filter(Boolean).join(" ");
        return more ? `${v}: ${more}` : v;
      }
      return v;
    });
    let text = pieces.join(", ");
    if (!Array.isArray(value) && extra && !isOtherOption(String(value))) text += `: ${extra}`;
    if (followUpFile) text += ` [file: ${followUpFile}]`;
    return text;
  };

  if (reviewing) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{catalogue.length > 0 ? "Review your order" : "Check your answers"}</h2>
          <p className="text-sm text-muted-foreground">{catalogue.length > 0 ? "Look over your order and your details. If something is wrong, go back and fix it before you confirm." : "Look everything over. If something is wrong, go back and fix it before you confirm."}</p>
        </div>
        {combinedErrors.length > 0 && (
          <div role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              Please fix the following
            </div>
            <ul className="list-disc pl-6">
              {combinedErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
        {chargeLines.length > 0 && <ChargeSummary lines={chargeLines} total={chargeTotal} heading={catalogue.length > 0 ? "Your order" : "To pay"} />}
        {documentsInPerson && (
          <p className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
            You chose to buy your {documentLines.map((l) => l.name).join(" and ")} in person. You will pay {formatMinor(documentLines.reduce((sum, l) => sum + l.amountMinor, 0))} at the program.
          </p>
        )}
        {groups.map((group) => {
          const rows = group.fields
            .filter((f) => isVisible(f, responses))
            .map((f) => ({ label: f.label, value: answerText(f) }))
            .filter((row) => row.value !== "");
          if (rows.length === 0) return null;
          return (
            <div key={group.id ?? "unassigned"} className="flex flex-col gap-2">
              {hasSections && <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">{group.title}</h3>}
              <dl className="divide-y divide-border/60 rounded-lg border border-border/60">
                {rows.map((row, i) => (
                  <div key={`${row.label}-${i}`} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[40%_1fr] sm:gap-3">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="whitespace-pre-line break-words font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => setReviewing(false)} disabled={submitting}>
            <ChevronLeft className="h-4 w-4" />
            {catalogue.length > 0 ? "Edit my order" : "Edit my answers"}
          </Button>
          <Button type="button" onClick={() => void submitNow()} loading={submitting}>
            {submitting ? "Submitting..." : (submitLabel ?? (willPay ? `Confirm and pay ${formatMinor(chargeTotal)}` : "Confirm and submit"))}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-6" noValidate>
      {!isSingle && steps.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {activeStep + 1} of {steps.length}
            </span>
            <span className="min-w-0 truncate pl-3 text-right">{currentStep.title}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {catalogue.length > 0 && (isSingle || activeStep === 0) && (
        <OrderItemsPicker
          items={catalogue}
          selection={selection}
          error={itemsMissing && chosenCount === 0}
          onChange={(update) => {
            setSelection(update);
            setItemsMissing(false);
          }}
        />
      )}

      {isSingle ? (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <div key={group.id ?? "unassigned"} className="flex flex-col gap-5">
              {hasSections && group.fields.length > 0 && (
                <h3 className="border-b border-border/60 pb-2 text-sm font-semibold text-muted-foreground">{group.title}</h3>
              )}
              {group.fields.map(renderField)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">{currentStep.fields.map(renderField)}</div>
      )}

      {canChooseInPerson && (isSingle || isLastStep) && <DocumentPaymentChoice lines={documentLines} value={documentChoice} onChange={setDocumentChoice} />}
      {willPay && (isSingle || isLastStep) && <ChargeSummary lines={chargeLines} total={chargeTotal} />}

      {consentNeeded && (isSingle || isLastStep) && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-gradient-brand-soft p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="whitespace-pre-line text-sm text-foreground">
              {consentText || "By submitting, you consent to the collection of the information in this form."}
            </div>
          </div>
          <label htmlFor="consent-agree" className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              id="consent-agree"
              checked={consentChecked}
              onCheckedChange={(checked) => {
                setConsentChecked(checked === true);
                if (checked === true) setStepErrors((errs) => errs.filter((e) => e !== CONSENT_REQUIRED_MESSAGE));
              }}
              className="mt-0.5"
              aria-required="true"
            />
            <span>I have read and agree to the consent statement above.</span>
          </label>
        </div>
      )}

      {reviewConfirmNeeded && (isSingle || isLastStep) && (
        <label
          htmlFor="review-confirm"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/25 bg-gradient-brand-soft p-4 text-sm"
        >
          <Checkbox
            id="review-confirm"
            checked={reviewConfirmed}
            onCheckedChange={(checked) => {
              setReviewConfirmed(checked === true);
              if (checked === true) setStepErrors((errs) => errs.filter((e) => e !== REVIEW_REQUIRED_MESSAGE));
            }}
            className="mt-0.5"
            aria-required="true"
          />
          {reviewConfirmText?.trim() ? (
            <span className="whitespace-pre-line">{reviewConfirmText.trim()}</span>
          ) : (
            <span>
              <span className="font-medium">I have gone through the entire form</span> and confirm that all the information
              I entered is complete and correct.
            </span>
          )}
        </label>
      )}

      {combinedErrors.length > 0 && (
        <div ref={errorBoxRef} role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            Please fix the following
          </div>
          <ul className="list-disc pl-6">
            {combinedErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {!isSingle && activeStep > 0 ? (
          <Button type="button" variant="outline" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        ) : onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={clearForm} disabled={submitting}>
            <Eraser className="h-4 w-4" />
            Clear form
          </Button>
          {isSingle || isLastStep ? (
            <Button type="submit" loading={submitting}>
              {reviewBeforeSubmit ? "Review your answers" : submitting ? "Submitting..." : (submitLabel ?? (willPay ? `Submit and pay ${formatMinor(chargeTotal)}` : "Submit registration"))}
            </Button>
          ) : (
            <Button type="button" onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
