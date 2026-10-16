import type { ZodIssue } from "zod";

/** "organizationName" or "full_name" become "Organization name" and "Full name". */
export function fieldLabel(path: (string | number)[]): string {
  const last = [...path].reverse().find((part) => typeof part === "string") as string | undefined;
  if (!last) return "This";
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const GENERIC = [/^Required$/, /^Invalid( input)?$/, /^Invalid (email|url|uuid|date|datetime|enum value)/i, /^String must contain/, /^Number must be/, /^Array must contain/, /^Expected .+, received/, /^Invalid literal/, /^Too (small|big)/];
const isGeneric = (message: string) => GENERIC.some((re) => re.test(message));

/**
 * What is wrong with one field, in plain words that name the field. Messages somebody wrote on purpose
 * ("Use at least 10 characters") are kept as they are; only Zod's built-in ones are rewritten.
 */
export function describeIssue(issue: ZodIssue): string {
  if (issue.message && !isGeneric(issue.message)) return issue.message;
  const label = fieldLabel(issue.path);
  const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" || issue.received === "null" ? `${label} is required` : `${label} is not in the right format (expected ${issue.expected})`;
    case "invalid_string":
      if (issue.validation === "email") return `${label}: enter a valid email address, like name@example.com`;
      if (issue.validation === "url") return `${label}: enter a valid web address, starting with https://`;
      if (issue.validation === "uuid") return `${label} is not a valid reference. Refresh the page and try again`;
      if (issue.validation === "datetime" || issue.validation === "date") return `${label}: enter a valid date`;
      return `${label} contains characters that are not allowed`;
    case "too_small": {
      const n = Number(issue.minimum);
      if (issue.type === "string") return n <= 1 ? `${label} cannot be empty` : `${label} must be at least ${n} characters`;
      if (issue.type === "array") return n <= 1 ? `Choose at least one ${label.toLowerCase()}` : `${label} needs at least ${n} ${noun(n, "item", "items")}`;
      return `${label} must be ${issue.inclusive ? "at least" : "more than"} ${n}`;
    }
    case "too_big": {
      const n = Number(issue.maximum);
      if (issue.type === "string") return `${label} is too long (at most ${n} characters)`;
      if (issue.type === "array") return `${label} has too many items (at most ${n})`;
      return `${label} must be ${issue.inclusive ? "at most" : "less than"} ${n}`;
    }
    case "invalid_enum_value":
      return `${label} must be one of: ${issue.options.join(", ")}`;
    case "invalid_literal":
      return `${label} has a value that is not accepted`;
    case "unrecognized_keys":
      return `Unexpected information was sent (${issue.keys.join(", ")})`;
    default:
      return `${label} is not valid`;
  }
}

/** Every field's problem, keyed by its name, so a form can put each message under the right box. */
export function issuesByField(issues: ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.filter((part) => typeof part === "string").join(".") || "_";
    fields[key] ??= describeIssue(issue);
  }
  return fields;
}
