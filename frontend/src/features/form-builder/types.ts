import type { ConditionalRule, FieldConfig, FieldType, OrderItem } from "@/types/api";

export interface EditableSection {
  key: string;
  title: string;
  description?: string;
  orderIndex: number;
  conditionalLogic?: ConditionalRule[];
}

export interface EditableField {
  fieldKey: string;
  sectionKey: string | null;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  orderIndex: number;
  config: FieldConfig;
  conditionalLogic?: ConditionalRule[];
}

export type FormLayoutMode = "stepped" | "single";

export interface EditableFormPayload {
  title: string;
  description?: string;
  instructions?: string;
  confirmationMessage?: string;
  requireConsent: boolean;
  consentText?: string;
  consentConditions?: ConditionalRule[];
  showRegistrationNumber: boolean;
  registrationNumberConditions?: ConditionalRule[];
  reviewConfirmEnabled: boolean;
  reviewConfirmText?: string;
  reviewConfirmConditions?: ConditionalRule[];
  layoutMode: FormLayoutMode;
  /** The goods an order form sells (order forms only). */
  orderItems?: OrderItem[];
  sections: EditableSection[];
  fields: EditableField[];
}
