import type { DocumentSettings, LineItem, StatusDef, StatusKind } from "@designs";
import { apiFetch, downloadAuthenticatedFile } from "@/lib/api";
import type { PaginatedResult } from "@/types/api";
import { uploadToCloudinary, type UploadSignature } from "../programs/api";

export type DocumentKind = "invoice" | "receipt" | "quotation";
export const kindPath = (kind: DocumentKind) => (kind === "invoice" ? "invoices" : kind === "receipt" ? "receipts" : "quotations");

export interface Business {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  taxNumber: string | null;
  currency: string;
  brandColor: string;
  notifyCustomerOnStatus: boolean;
  invoiceSettings: DocumentSettings;
  receiptSettings: DocumentSettings;
  quotationSettings: DocumentSettings;
  /** The business's own order, invoice, and receipt statuses. */
  statusConfig: Record<StatusKind, StatusDef[]>;
  createdAt: string;
  myRole?: "admin" | "viewer" | null;
  orderForm: { id: string; slug: string; status: string; registrationEnabled: boolean; notifyOnRegistration: boolean } | null;
  orderCount?: number;
  invoiceCount?: number;
  receiptCount?: number;
  quotationCount?: number;
}

export interface BusinessDocument {
  id: string;
  businessId: string;
  kind: DocumentKind;
  sequence: number;
  number: string;
  status: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  issueDate: string;
  dueDate: string | null;
  paymentMethod: string | null;
  currency: string;
  items: LineItem[];
  discount: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  terms: string | null;
  customFields: Record<string, string>;
  updated: boolean;
  editedAt: string | null;
  sentAt: string | null;
  lastSentTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentInput {
  status?: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  issueDate: string;
  dueDate: string | null;
  paymentMethod: string | null;
  items: LineItem[];
  discount: number;
  taxRate: number;
  amountPaid: number;
  notes: string | null;
  terms: string | null;
  customFields: Record<string, string>;
}

export interface DocumentAnalytics {
  count: number;
  total: number;
  paid: number;
  outstanding: number;
  byStatus: { status: string; count: number; total: number; paid: number }[];
  byMonth: { month: string; count: number; total: number }[];
  topClients: { client: string; count: number; total: number }[];
}

export interface BusinessAnalytics {
  invoices: DocumentAnalytics;
  receipts: DocumentAnalytics;
  quotations?: DocumentAnalytics;
  orders: { total: number; today: number; thisWeek: number; thisMonth: number; byStatus: Record<string, number> } | null;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const listBusinesses = (params: { page?: number; pageSize?: number; search?: string }) =>
  apiFetch<PaginatedResult<Business>>(`/businesses${query(params)}`);
export const getBusiness = (businessId: string) => apiFetch<Business>(`/businesses/${businessId}`);
export const createBusiness = (input: { name: string; description?: string; email?: string; phone?: string; address?: string; tenantId?: string }) =>
  apiFetch<Business>("/businesses", { method: "POST", body: input });
export const updateBusiness = (businessId: string, input: Partial<Business>) =>
  apiFetch<Business>(`/businesses/${businessId}`, { method: "PATCH", body: input });
export const saveStatusConfig = (businessId: string, config: Record<StatusKind, StatusDef[]>) =>
  apiFetch<Business>(`/businesses/${businessId}/statuses`, { method: "PUT", body: config });
export const deleteBusiness = (businessId: string) => apiFetch<null>(`/businesses/${businessId}`, { method: "DELETE" });
export const getOrderShareInfo = (businessId: string) =>
  apiFetch<{ url: string; live: boolean; acceptingOrders: boolean; qrCodeDataUrl: string | null }>(`/businesses/${businessId}/order-form/share`);
export const getBusinessAnalytics = (businessId: string) => apiFetch<BusinessAnalytics>(`/businesses/${businessId}/analytics`);
export const saveDocumentSettings = (businessId: string, kind: DocumentKind, settings: DocumentSettings) =>
  apiFetch<DocumentSettings>(`/businesses/${businessId}/settings/${kindPath(kind)}`, { method: "PUT", body: settings });

export const listDocuments = (businessId: string, kind: DocumentKind, params: { page?: number; pageSize?: number; search?: string; status?: string; dateFrom?: string; dateTo?: string }) =>
  apiFetch<PaginatedResult<BusinessDocument>>(`/businesses/${businessId}/${kindPath(kind)}${query(params)}`);
export const getDocument = (businessId: string, kind: DocumentKind, documentId: string) =>
  apiFetch<BusinessDocument>(`/businesses/${businessId}/${kindPath(kind)}/${documentId}`);
export const createDocument = (businessId: string, kind: DocumentKind, input: DocumentInput) =>
  apiFetch<BusinessDocument>(`/businesses/${businessId}/${kindPath(kind)}`, { method: "POST", body: input });
export const updateDocument = (businessId: string, kind: DocumentKind, documentId: string, input: DocumentInput) =>
  apiFetch<BusinessDocument>(`/businesses/${businessId}/${kindPath(kind)}/${documentId}`, { method: "PUT", body: input });
export const deleteDocument = (businessId: string, kind: DocumentKind, documentId: string) =>
  apiFetch<null>(`/businesses/${businessId}/${kindPath(kind)}/${documentId}`, { method: "DELETE" });
export const sendDocument = (businessId: string, kind: DocumentKind, documentId: string, input: { email?: string; message?: string }) =>
  apiFetch<BusinessDocument>(`/businesses/${businessId}/${kindPath(kind)}/${documentId}/send`, { method: "POST", body: input });
export const getDocumentPages = (businessId: string, kind: DocumentKind, documentId: string) =>
  apiFetch<{ pages: string[]; fileBase: string }>(`/businesses/${businessId}/${kindPath(kind)}/${documentId}/pages`);
export const downloadDocumentPdf = (businessId: string, kind: DocumentKind, documentId: string, fallbackName: string) =>
  downloadAuthenticatedFile(`/businesses/${businessId}/${kindPath(kind)}/${documentId}/pdf`, fallbackName);

export async function uploadBusinessImage(businessId: string, file: File): Promise<string> {
  const signature = await apiFetch<UploadSignature>(`/businesses/${businessId}/uploads/signature`, { method: "POST" });
  const { secureUrl } = await uploadToCloudinary(file, signature);
  return secureUrl;
}

// ---------------------------------------------------------------------------
// Business cards

export interface BusinessCard {
  id: string;
  businessId: string;
  name: string;
  jobTitle: string | null;
  company: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  tagline: string | null;
  photoUrl: string | null;
  template: string;
  primaryColor: string;
  secondaryColor: string;
  showQr: boolean;
  lastSentTo: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CardInput = Omit<BusinessCard, "id" | "businessId" | "lastSentTo" | "sentAt" | "createdAt" | "updatedAt">;

export const listCards = (businessId: string, params: { page?: number; pageSize?: number; search?: string; dateFrom?: string; dateTo?: string }) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  const text = query.toString();
  return apiFetch<PaginatedResult<BusinessCard>>(`/businesses/${businessId}/cards${text ? `?${text}` : ""}`);
};
export const getCard = (businessId: string, cardId: string) => apiFetch<BusinessCard>(`/businesses/${businessId}/cards/${cardId}`);
export const createCard = (businessId: string, input: CardInput) => apiFetch<BusinessCard>(`/businesses/${businessId}/cards`, { method: "POST", body: input });
export const updateCard = (businessId: string, cardId: string, input: CardInput) =>
  apiFetch<BusinessCard>(`/businesses/${businessId}/cards/${cardId}`, { method: "PUT", body: input });
export const deleteCard = (businessId: string, cardId: string) => apiFetch<null>(`/businesses/${businessId}/cards/${cardId}`, { method: "DELETE" });
export const getCardPages = (businessId: string, cardId: string) =>
  apiFetch<{ pages: string[]; fileBase: string }>(`/businesses/${businessId}/cards/${cardId}/pages`);
export const downloadCardPdf = (businessId: string, cardId: string, fallbackName: string) =>
  downloadAuthenticatedFile(`/businesses/${businessId}/cards/${cardId}/pdf`, fallbackName);
export const sendCard = (businessId: string, cardId: string, input: { email: string; recipientName?: string; message?: string }) =>
  apiFetch<BusinessCard>(`/businesses/${businessId}/cards/${cardId}/send`, { method: "POST", body: input });
