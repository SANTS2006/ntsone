import { AppError } from "../../lib/errors.js";
import type { FieldRow } from "../forms/repository.js";

export interface SubmittedFile {
  fieldKey: string;
  url: string;
  publicId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface ConditionalRule {
  fieldKey: string;
  operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value?: string | number | boolean;
}

const FILE_FIELD_TYPES = new Set(["image_upload", "pdf_upload", "document_upload"]);
const OTHER_TEXT_MAX_LENGTH = 500;

/** Options like "Other" or "Other (please specify)" ask the registrant to type their own answer. */
export function isOtherOption(option: string): boolean {
  return /^other\b/i.test(option.trim());
}

/** Key under which the free-text answer for a chosen "Other" option is stored. */
export function otherTextKey(fieldKey: string): string {
  return `${fieldKey}__other`;
}

/** Multiple choice: each ticked option can ask for its own extra answer, kept together under this key as option -> answer. */
export function followTextKey(fieldKey: string): string {
  return `${fieldKey}__follow`;
}

/** The key one option's extra answer (or uploaded file) is sent under. */
export function optionFollowKey(fieldKey: string, option: string): string {
  return `${fieldKey}__fu__${option}`;
}

export interface FollowUp {
  mode: "text" | "short_text" | "number" | "email" | "phone" | "date" | "dropdown" | "file" | "text_or_file";
  label?: string;
  required?: boolean;
  options?: string[];
  conditions?: ConditionalRule[];
}

/** An extra input only applies when the admin's rules for it match the answers given. */
function followUpApplies(followUp: FollowUp, responses: Record<string, unknown>): boolean {
  return (followUp.conditions ?? []).every((rule) => evaluateRule(rule, responses));
}

const followUpAsksFile = (mode: FollowUp["mode"]) => mode === "file" || mode === "text_or_file";
const followUpAsksText = (mode: FollowUp["mode"]) => mode !== "file";

/** Messages for a follow-up answer that doesn't fit the kind of input the admin chose. */
function followUpFormatError(followUp: FollowUp, text: string): string | null {
  if (!text) return null;
  switch (followUp.mode) {
    case "number":
      return Number.isFinite(Number(text)) ? null : "must be a number";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? null : "must be a valid email address";
    case "phone":
      return /^[+()\d\s.-]{5,25}$/.test(text) ? null : "must be a valid phone number";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? null : "must be a valid date";
    case "dropdown":
      return (followUp.options ?? []).includes(text) ? null : "must be one of the listed choices";
    default:
      return null;
  }
}

const FOLLOW_UP_TEXT_MAX_LENGTH = 2000;
const SINGLE_VALUE_FOLLOW_UP_TYPES = new Set(["single_choice", "dropdown", "yes_no", "gender", "country"]);

/** Checks one extra answer and returns what to keep (the text and any file names together). */
function checkFollowUp(
  followUp: FollowUp,
  label: string,
  text: string,
  uploadedAll: SubmittedFile[],
  errors: string[],
): string | null {
  const asksText = followUpAsksText(followUp.mode);
  const asksFile = followUpAsksFile(followUp.mode);
  const uploaded = asksFile ? uploadedAll : [];
  const prompt = followUp.label?.trim() || "more details";
  if (text.length > FOLLOW_UP_TEXT_MAX_LENGTH) errors.push(`${label}: ${prompt} must be at most ${FOLLOW_UP_TEXT_MAX_LENGTH} characters`);
  if (followUp.required) {
    const missing = asksText && asksFile ? !text && uploaded.length === 0 : asksText ? !text : uploaded.length === 0;
    if (missing) errors.push(`${label}: please provide ${prompt}`);
  }
  const formatProblem = asksText ? followUpFormatError(followUp, text) : null;
  if (formatProblem) errors.push(`${label}: ${prompt} ${formatProblem}`);
  // The description and any uploaded file names are kept together, so every export and email shows both.
  const parts = [asksText ? text : "", ...uploaded.map((f) => `[file: ${f.filename}]`)].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** What a chosen option asks for on top of the choice itself (e.g. "Yes" -> describe your design). */
function followUpFor(field: FieldRow, value: unknown, responses: Record<string, unknown>): FollowUp | null {
  if (!SINGLE_VALUE_FOLLOW_UP_TYPES.has(field.type)) return null;
  const followUps = ((field.config as Record<string, unknown>)?.followUps ?? {}) as Record<string, FollowUp>;
  const key = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value ?? "");
  const followUp = followUps[key] ?? null;
  return followUp && followUpApplies(followUp, responses) ? followUp : null;
}

interface OptionsDependOn {
  fieldKey: string;
  map: Record<string, string[]>;
}

/** The options valid for a field right now -- narrowed by its parent's answer for cascading fields. */
function allowedOptions(field: FieldRow, responses: Record<string, unknown>): string[] | undefined {
  const list = baseOptions(field, responses);
  const rules = ((field.config as Record<string, unknown>)?.optionConditions ?? {}) as Record<string, ConditionalRule[]>;
  // An option the admin hid behind conditions is only valid while its conditions match.
  return list?.filter((option) => (rules[option] ?? []).every((rule) => evaluateRule(rule, responses)));
}

function baseOptions(field: FieldRow, responses: Record<string, unknown>): string[] | undefined {
  const config = (field.config as Record<string, unknown>) ?? {};
  const dep = config.optionsDependOn as OptionsDependOn | undefined;
  if (dep) {
    const parentValue = responses[dep.fieldKey];
    return isEmptyValue(parentValue) ? [] : (dep.map[String(parentValue)] ?? []);
  }
  return config.options as string[] | undefined;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function evaluateRule(rule: ConditionalRule, responses: Record<string, unknown>): boolean {
  const actual = responses[rule.fieldKey];
  switch (rule.operator) {
    case "equals":
      // Coerce both sides to string: form values may be booleans/numbers while the
      // admin-configured condition value is always typed in as a string.
      return String(actual) === String(rule.value);
    case "not_equals":
      return String(actual) !== String(rule.value);
    case "contains":
      return Array.isArray(actual) ? actual.includes(rule.value) : String(actual ?? "").includes(String(rule.value ?? ""));
    case "is_empty":
      return isEmptyValue(actual);
    case "is_not_empty":
      return !isEmptyValue(actual);
    default:
      return true;
  }
}

/** Required, unless the admin made it required only when certain other answers match. */
function isRequired(field: FieldRow, responses: Record<string, unknown>): boolean {
  if (!field.required) return false;
  const rules = ((field.config as Record<string, unknown>)?.requiredConditions ?? []) as ConditionalRule[];
  return rules.every((rule) => evaluateRule(rule, responses));
}

function isFieldVisible(field: FieldRow, responses: Record<string, unknown>): boolean {
  const rules = (field.conditionalLogic as ConditionalRule[] | null) ?? [];
  if (rules.length === 0) return true;
  return rules.every((rule) => evaluateRule(rule, responses));
}

const DAY_MS = 86_400_000;

const dayOf = (value: string) => value.slice(0, 10);

/** "today" or a YYYY-MM-DD limit, as a day. */
function limitDay(limit: unknown): string | null {
  if (limit === "today") return new Date().toISOString().slice(0, 10);
  return typeof limit === "string" && /^\d{4}-\d{2}-\d{2}$/.test(limit) ? limit : null;
}

function yearsBetween(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Messages for a date outside the allowed range (a day of slack for "today", as time zones differ). */
export function dateLimitErrors(label: string, type: string, config: Record<string, unknown>, value: string): string[] {
  const errors: string[] = [];
  const day = dayOf(value);
  const slack = (limit: unknown) => (limit === "today" ? DAY_MS : 0);
  const min = limitDay(config.minDate);
  const max = limitDay(config.maxDate);
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  if (min && ms(day) < ms(min) - slack(config.minDate)) errors.push(`${label} can't be earlier than ${min}`);
  if (max && ms(day) > ms(max) + slack(config.maxDate)) errors.push(`${label} can't be later than ${max}`);
  if (type === "date_of_birth") {
    const age = yearsBetween(day, new Date().toISOString().slice(0, 10));
    if (typeof config.minAge === "number" && age < config.minAge) errors.push(`${label}: you must be at least ${config.minAge} years old`);
    if (typeof config.maxAge === "number" && age > config.maxAge) errors.push(`${label}: you must be ${config.maxAge} years old or younger`);
  }
  return errors;
}

const LIMIT_KEYS = ["minLength", "maxLength", "regex", "minNumber", "maxNumber", "minDate", "maxDate", "minAge", "maxAge", "maxSelections"];

/** The question's settings, without its limits when the admin made them apply only under conditions that aren't met. */
function configWithLimits(field: FieldRow, responses: Record<string, unknown>): Record<string, unknown> {
  const config = { ...((field.config as Record<string, unknown>) ?? {}) };
  const rules = (config.limitConditions ?? []) as ConditionalRule[];
  if (!rules.every((rule) => evaluateRule(rule, responses))) for (const key of LIMIT_KEYS) delete config[key];
  return config;
}

function validateFieldValue(
  field: FieldRow,
  value: unknown,
  errors: string[],
  responses: Record<string, unknown>,
): unknown {
  const config = configWithLimits(field, responses);
  const label = field.label;

  // A cascading field with no choices for the parent's answer (e.g. District "Other")
  // doesn't apply, so it can't be required.
  const notApplicable = Boolean(config.optionsDependOn) && (allowedOptions(field, responses)?.length ?? 0) === 0;

  if (isEmptyValue(value)) {
    if (isRequired(field, responses) && !notApplicable) errors.push(`${label} is required`);
    return null;
  }

  switch (field.type) {
    case "short_text":
    case "long_text":
    case "address": {
      const str = String(value);
      if (typeof config.minLength === "number" && str.length < config.minLength) {
        errors.push(`${label} must be at least ${config.minLength} characters`);
      }
      if (typeof config.maxLength === "number" && str.length > config.maxLength) {
        errors.push(`${label} must be at most ${config.maxLength} characters`);
      }
      if (typeof config.regex === "string" && config.regex) {
        try {
          if (!new RegExp(config.regex).test(str)) errors.push(`${label} is not in a valid format`);
        } catch {
          /* ignore invalid stored regex */
        }
      }
      return str;
    }
    case "email": {
      const str = String(value);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) errors.push(`${label} must be a valid email address`);
      return str.toLowerCase();
    }
    case "phone": {
      const str = String(value);
      if (!/^[0-9+()\-\s]{6,20}$/.test(str)) errors.push(`${label} must be a valid phone number`);
      return str;
    }
    case "url": {
      const str = String(value);
      try {
        new URL(str);
      } catch {
        errors.push(`${label} must be a valid URL`);
      }
      return str;
    }
    case "number":
    case "currency":
    case "rating": {
      const num = Number(value);
      if (Number.isNaN(num)) {
        errors.push(`${label} must be a number`);
        return null;
      }
      // Amounts, quantities and ratings are never negative, and nothing absurdly large is kept.
      if (!Number.isFinite(num) || Math.abs(num) > 1e12) {
        errors.push(`${label} is not a valid number`);
        return null;
      }
      if (num < 0) {
        errors.push(`${label} can't be negative`);
        return null;
      }
      if (typeof config.minNumber === "number" && num < config.minNumber) {
        errors.push(`${label} must be at least ${config.minNumber}`);
      }
      if (typeof config.maxNumber === "number" && num > config.maxNumber) {
        errors.push(`${label} must be at most ${config.maxNumber}`);
      }
      return num;
    }
    case "date":
    case "date_of_birth":
    case "datetime": {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) {
        errors.push(`${label} must be a valid date`);
        return String(value);
      }
      errors.push(...dateLimitErrors(label, field.type, config, String(value)));
      return String(value);
    }
    case "time": {
      const str = String(value);
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(str)) errors.push(`${label} must be a valid time (HH:MM)`);
      return str;
    }
    case "single_choice":
    case "dropdown":
    case "gender":
    case "country": {
      const str = String(value);
      const options = allowedOptions(field, responses);
      const cascading = Boolean(config.optionsDependOn);
      if (options && (options.length > 0 || cascading) && !options.includes(str)) {
        errors.push(`${label} must be one of the allowed options`);
      }
      return str;
    }
    case "multiple_choice": {
      const arr = Array.isArray(value) ? value.map(String) : [String(value)];
      const options = allowedOptions(field, responses);
      if (options && (options.length > 0 || Boolean(config.optionsDependOn))) {
        for (const item of arr) {
          if (!options.includes(item)) errors.push(`${label} contains an invalid option`);
        }
      }
      if (typeof config.maxSelections === "number" && arr.length > config.maxSelections) {
        errors.push(`${label}: choose at most ${config.maxSelections} option${config.maxSelections === 1 ? "" : "s"}`);
      }
      return arr;
    }
    case "yes_no": {
      if (typeof value === "boolean") return value;
      if (value === "yes" || value === "true") return true;
      if (value === "no" || value === "false") return false;
      errors.push(`${label} must be yes or no`);
      return null;
    }
    case "consent": {
      if (value !== true && value !== "true") {
        errors.push(`You must agree to ${label}`);
        return false;
      }
      return true;
    }
    case "image_upload":
    case "pdf_upload":
    case "document_upload":
      // handled via the files array, not the responses value
      return value;
    default:
      return value;
  }
}

interface SectionLike {
  id: string;
  conditionalLogic: unknown;
}

/** Sections the admin hid behind conditions that the answers don't meet. */
function hiddenSectionIds(sections: SectionLike[], responses: Record<string, unknown>): Set<string> {
  return new Set(
    sections
      .filter((s) => ((s.conditionalLogic as ConditionalRule[] | null) ?? []).some((rule) => !evaluateRule(rule, responses)))
      .map((s) => s.id),
  );
}

/** Uploads belonging to a file question that is hidden by its conditions are not kept. */
export function dropHiddenFileUploads(
  fields: FieldRow[],
  responses: Record<string, unknown>,
  files: SubmittedFile[],
  sections: SectionLike[] = [],
): SubmittedFile[] {
  const hiddenSections = hiddenSectionIds(sections, responses);
  const hidden = new Set(
    fields
      .filter((f) => FILE_FIELD_TYPES.has(f.type) && (!isFieldVisible(f, responses) || (f.sectionId !== null && hiddenSections.has(f.sectionId))))
      .map((f) => f.fieldKey),
  );
  return files.filter((f) => !hidden.has(f.fieldKey));
}

/** Messages that only say an answer is missing (as opposed to wrong). */
const MISSING_ANSWER = /( is required$|requires a file upload$|^Please specify your answer|: please provide )/;

/**
 * Checks the answers against the form and returns them cleaned up. With `ignoreRequired`, an answer that
 * is simply missing is not an error (used for imported and edited registrations); wrong answers still are.
 */
export function validateAndNormalizeResponses(
  fields: FieldRow[],
  rawResponses: Record<string, unknown>,
  files: SubmittedFile[],
  sections: SectionLike[] = [],
  options: { ignoreRequired?: boolean } = {},
): Record<string, unknown> {
  const errors: string[] = [];
  const hiddenSections = hiddenSectionIds(sections, rawResponses);
  const cleaned: Record<string, unknown> = {};
  const filesByField = new Map<string, SubmittedFile[]>();
  for (const file of files) {
    filesByField.set(file.fieldKey, [...(filesByField.get(file.fieldKey) ?? []), file]);
  }

  for (const field of fields) {
    const visible = isFieldVisible(field, rawResponses) && !(field.sectionId !== null && hiddenSections.has(field.sectionId));
    if (!visible) {
      cleaned[field.fieldKey] = null;
      continue;
    }

    if (FILE_FIELD_TYPES.has(field.type)) {
      const uploaded = filesByField.get(field.fieldKey) ?? [];
      if (isRequired(field, rawResponses) && uploaded.length === 0) {
        errors.push(`${field.label} requires a file upload`);
      }
      cleaned[field.fieldKey] = uploaded.map((f) => ({ url: f.url, filename: f.filename }));
      continue;
    }

    const value = validateFieldValue(field, rawResponses[field.fieldKey], errors, rawResponses);
    cleaned[field.fieldKey] = value;

    const followUp = isEmptyValue(value) ? null : followUpFor(field, value, rawResponses);
    if (followUp) {
      const key = otherTextKey(field.fieldKey);
      const text = String(rawResponses[key] ?? "").trim();
      cleaned[key] = checkFollowUp(followUp, field.label, text, filesByField.get(key) ?? [], errors);
      continue;
    }

    if (field.type === "multiple_choice" && Array.isArray(value)) {
      const configured = ((field.config as Record<string, unknown>)?.followUps ?? {}) as Record<string, FollowUp>;
      const answers: Record<string, string> = {};
      for (const option of value.map(String)) {
        const asks = configured[option];
        if (!asks || !followUpApplies(asks, rawResponses)) continue;
        const key = optionFollowKey(field.fieldKey, option);
        const kept = checkFollowUp(asks, `${field.label} (${option})`, String(rawResponses[key] ?? "").trim(), filesByField.get(key) ?? [], errors);
        if (kept) answers[option] = kept;
      }
      cleaned[followTextKey(field.fieldKey)] = Object.keys(answers).length ? answers : null;
    }

    const chosen = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const otherRules = ((field.config as Record<string, unknown>)?.otherConditions ?? []) as ConditionalRule[];
    if (chosen.some((option) => isOtherOption(String(option))) && otherRules.every((rule) => evaluateRule(rule, rawResponses))) {
      const otherText = String(rawResponses[otherTextKey(field.fieldKey)] ?? "").trim();
      if (!otherText) errors.push(`Please specify your answer for ${field.label}`);
      else if (otherText.length > OTHER_TEXT_MAX_LENGTH) {
        errors.push(`${field.label}: your answer must be at most ${OTHER_TEXT_MAX_LENGTH} characters`);
      }
      cleaned[otherTextKey(field.fieldKey)] = otherText || null;
    }
  }

  const blocking = options.ignoreRequired ? errors.filter((e) => !MISSING_ANSWER.test(e)) : errors;
  if (blocking.length > 0) {
    throw AppError.validation("Registration form has validation errors", blocking);
  }

  return cleaned;
}

export function extractApplicantContact(
  fields: FieldRow[],
  responses: Record<string, unknown>,
): { name: string | null; email: string | null; phone: string | null } {
  let email: string | null = null;
  let phone: string | null = null;
  let fullName: string | null = null;
  let anyName: string | null = null;
  const parts: { first?: string; middle?: string; last?: string } = {};

  for (const field of fields) {
    const value = responses[field.fieldKey];
    if (value === null || value === undefined || value === "") continue;

    if (field.type === "email" && !email) email = String(value);
    if (field.type === "phone" && !phone) phone = String(value);
    if (field.type !== "short_text") continue;

    const key = field.fieldKey.toLowerCase();
    const text = String(value).trim();
    if (!/name/.test(key) || /(org|company|institution|school|employer|contact|emergency|next_of_kin)/.test(key)) continue;

    if (/full_?name|^name$/.test(key)) fullName ??= text;
    else if (/first|given|fore/.test(key)) parts.first ??= text;
    else if (/middle|other_?names?/.test(key)) parts.middle ??= text;
    else if (/last|sur|family/.test(key)) parts.last ??= text;
    anyName ??= text;
  }

  // Forms often split names (first / middle / last); combine them into one display name.
  const combined = [parts.first, parts.middle, parts.last].filter(Boolean).join(" ");
  return { name: fullName ?? (combined || anyName), email, phone };
}

/** The required questions a registration has not answered yet, as readable messages (empty when it is complete). */
export function missingRequiredAnswers(
  fields: FieldRow[],
  responses: Record<string, unknown>,
  files: SubmittedFile[],
  sections: SectionLike[] = [],
): string[] {
  try {
    validateAndNormalizeResponses(fields, responses, files, sections);
    return [];
  } catch (err) {
    const details = err instanceof AppError && Array.isArray(err.details) ? (err.details as string[]) : [];
    return details.filter((e) => MISSING_ANSWER.test(e));
  }
}
