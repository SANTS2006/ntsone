import { apiFetch } from "@/lib/api";

export interface TicketConfig {
  template: string;
  primaryColor: string;
  secondaryColor: string;
  eventTitle?: string;
  tagline?: string;
  kicker?: string;
  eventDate?: string;
  eventTime?: string;
  venue?: string;
  terms?: string;
  contactPhone?: string;
  website?: string;
  visibleFields: string[];
  /** Free, or a price in leones. */
  isPaid: boolean;
  priceAmount?: number;
  showPrice: boolean;
  showParticipantName: boolean;
  showRegistrationNumber: boolean;
  showBarcode: boolean;
  showEventDetails: boolean;
  showContact: boolean;
  logoUrl?: string;
  eventImageUrl?: string;
  backgroundImageUrl?: string;
  textColor: "light" | "dark";
  overlayOpacity: number;
  showQrCode: boolean;
  showOnConfirmation: boolean;
}

export interface TicketConfigResponse {
  ticketEnabled: boolean;
  config: TicketConfig;
  organizationName: string;
}

export function getTicketConfig(programId: string) {
  return apiFetch<TicketConfigResponse>(`/programs/${programId}/ticket/config`);
}

export function updateTicketConfig(programId: string, config: TicketConfig) {
  // Blank optional text means "use the program's own details", so don't send empty strings.
  const body = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== "" && v !== undefined));
  return apiFetch<TicketConfig>(`/programs/${programId}/ticket/config`, { method: "PATCH", body });
}
