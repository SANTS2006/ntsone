import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { getDashboardTrendHandler } from "../analytics/controller.js";
import { getInsights } from "./insights.js";
import { getModuleInsights } from "./modules.js";
import { getOverview } from "./service.js";
import { date, exportFormatSchema, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/overview", async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    const overview = await getOverview(request.user);
    return sendSuccess(reply, overview);
  });
  app.get("/insights", async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    return sendSuccess(reply, await getInsights(request.user));
  });
  app.get("/modules", async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    return sendSuccess(reply, await getModuleInsights(request.user));
  });
  app.get("/analytics/trend", getDashboardTrendHandler);

  // The dashboard's tables as a download: program performance, recent registrations, recent scans.
  app.get("/export", async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    const { format } = exportFormatSchema.parse(request.query);
    const [insights, modules] = await Promise.all([getInsights(request.user), getModuleInsights(request.user)]);
    type Insights = typeof insights;
    const programs: ExportSheet<Insights["programs"][number]> = {
      name: "Programs",
      rows: insights.programs,
      columns: [
        { label: "Program", value: (p) => p.name },
        { label: "Status", value: (p) => p.status },
        { label: "Registrations", value: (p) => p.registrations },
        { label: "This week", value: (p) => p.registrationsThisWeek },
        { label: "Approved", value: (p) => p.approved },
        { label: "Scans", value: (p) => (p.documentsEnabled ? p.scans : "") },
        { label: "People checked in", value: (p) => (p.documentsEnabled ? p.peopleVerified : "") },
      ],
    };
    const registrations: ExportSheet<Insights["recentRegistrations"][number]> = {
      name: "Recent registrations",
      rows: insights.recentRegistrations,
      columns: [
        { label: "Submitted", value: (r) => date(r.submittedAt) },
        { label: "Program", value: (r) => r.programName },
        { label: "Registration number", value: (r) => r.registrationNumber },
        { label: "Name", value: (r) => r.applicantName },
        { label: "Status", value: (r) => r.status },
      ],
    };
    const scans: ExportSheet<Insights["recentScans"][number]> = {
      name: "Recent scans",
      rows: insights.recentScans,
      columns: [
        { label: "Scanned at", value: (s) => date(s.createdAt) },
        { label: "Program", value: (s) => s.programName },
        { label: "Registration number", value: (s) => s.registrationNumber },
        { label: "Name", value: (s) => s.applicantName },
        { label: "Document", value: (s) => (s.documentType === "ticket" ? "Ticket" : s.documentType === "id_card" ? "ID card" : "QR code") },
        { label: "Result", value: (s) => (s.valid ? "Valid" : "Not valid") },
        { label: "Scanned by", value: (s) => s.verifiedByName ?? "Not signed in" },
      ],
    };
    const pollSheet: ExportSheet<(typeof modules)["polls"]["top"][number]> = {
      name: "Polls",
      rows: modules.polls.top,
      columns: [
        { label: "Poll", value: (p) => p.name },
        { label: "State", value: (p) => p.state },
        { label: "Positions", value: (p) => p.positions },
        { label: "People who voted", value: (p) => p.voters },
        { label: "Votes cast", value: (p) => p.votes },
        { label: "Closes", value: (p) => date(p.closesAt) },
      ],
    };
    const businessSheet: ExportSheet<(typeof modules)["businesses"]["top"][number]> = {
      name: "Businesses",
      rows: modules.businesses.top,
      columns: [
        { label: "Business", value: (b) => b.name },
        { label: "Orders", value: (b) => b.orders },
        { label: "Invoices", value: (b) => b.invoices },
        { label: "Receipts", value: (b) => b.receipts },
      ],
    };
    const paymentSheet: ExportSheet<(typeof modules)["payments"]["recent"][number]> = {
      name: "Latest payments",
      rows: modules.payments.recent,
      columns: [
        { label: "Date", value: (p) => date(p.createdAt) },
        { label: "Program", value: (p) => p.programName },
        { label: "Payer", value: (p) => p.payer ?? "" },
        { label: "Amount (NLe)", value: (p) => p.amountMinor / 100 },
        { label: "Status", value: (p) => p.status },
      ],
    };
    const booksSheet: ExportSheet<NonNullable<(typeof modules)["books"]>["top"][number]> = {
      name: "Bookkeeping",
      rows: modules.books?.top ?? [],
      columns: [
        { label: "Business", value: (b) => b.name },
        { label: "Earned this month", value: (b) => b.revenueMinor / 100 },
        { label: "Costs this month", value: (b) => b.costsMinor / 100 },
        { label: "Profit or loss", value: (b) => b.profitMinor / 100 },
        { label: "Currency", value: (b) => b.currency },
      ],
    };
    return sendTableExport(reply, format, "Dashboard", [programs, registrations, scans, pollSheet, businessSheet, paymentSheet, booksSheet]);
  });
}
