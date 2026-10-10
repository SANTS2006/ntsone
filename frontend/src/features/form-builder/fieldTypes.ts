import type { FieldType } from "@/types/api";

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  group: "Basic" | "Choice" | "File" | "Advanced";
  hasOptions?: boolean;
  isFile?: boolean;
}

export const FIELD_TYPE_META: FieldTypeMeta[] = [
  { type: "short_text", label: "Short Text", group: "Basic" },
  { type: "long_text", label: "Paragraph", group: "Basic" },
  { type: "email", label: "Email", group: "Basic" },
  { type: "phone", label: "Phone Number", group: "Basic" },
  { type: "number", label: "Number", group: "Basic" },
  { type: "date", label: "Date", group: "Basic" },
  { type: "time", label: "Time", group: "Basic" },
  { type: "datetime", label: "Date & Time", group: "Basic" },
  { type: "single_choice", label: "Single Choice", group: "Choice", hasOptions: true },
  { type: "multiple_choice", label: "Multiple Choice", group: "Choice", hasOptions: true },
  { type: "dropdown", label: "Dropdown", group: "Choice", hasOptions: true },
  { type: "yes_no", label: "Yes / No", group: "Choice" },
  { type: "image_upload", label: "Image Upload", group: "File", isFile: true },
  { type: "pdf_upload", label: "PDF Upload", group: "File", isFile: true },
  { type: "document_upload", label: "Document Upload", group: "File", isFile: true },
  { type: "address", label: "Address", group: "Advanced" },
  { type: "country", label: "Country", group: "Advanced", hasOptions: true },
  { type: "gender", label: "Gender", group: "Advanced", hasOptions: true },
  { type: "date_of_birth", label: "Date of Birth", group: "Advanced" },
  { type: "url", label: "URL", group: "Advanced" },
  { type: "currency", label: "Currency / Amount", group: "Advanced" },
  { type: "rating", label: "Rating", group: "Advanced" },
  { type: "consent", label: "Agreement / Consent", group: "Advanced" },
];

export const FIELD_TYPE_GROUPS = ["Basic", "Choice", "File", "Advanced"] as const;

export function metaFor(type: FieldType): FieldTypeMeta {
  return FIELD_TYPE_META.find((m) => m.type === type)!;
}

export function defaultConfigFor(type: FieldType) {
  const meta = metaFor(type);
  if (meta.hasOptions) return { options: ["Option 1", "Option 2"] };
  if (type === "rating") return { maxRating: 5 };
  if (type === "currency") return { currencyCode: "USD" };
  return {};
}

const COUNTRY_OPTIONS = [
  "United States",
  "United Kingdom",
  "Canada",
  "Nigeria",
  "Kenya",
  "South Africa",
  "India",
  "Germany",
  "France",
  "Other",
];

export function smartDefaultConfig(type: FieldType) {
  if (type === "country") return { options: COUNTRY_OPTIONS };
  if (type === "gender") return { options: ["Male", "Female", "Other", "Prefer not to say"] };
  return defaultConfigFor(type);
}
