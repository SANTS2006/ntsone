import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => ({
  listContributions: vi.fn(),
  createContribution: vi.fn(),
  listRecords: vi.fn(),
  addRecord: vi.fn(),
  getTracker: vi.fn(),
  setPayment: vi.fn(),
}));
vi.mock("./api", async (original) => ({ ...(await original<Record<string, unknown>>()), ...api }));

import { ThemeProvider } from "@/app/ThemeContext";
import { ContributionsListPage } from "./ContributionsListPage";
import { RecordsTable } from "./RecordsTable";
import { TrackerTab } from "./TrackerTab";
import type { ContributionDetail } from "./api";

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  Object.values(api).forEach((fn) => fn.mockReset());
});

const detail = (overrides: Partial<ContributionDetail> = {}): ContributionDetail => ({
  id: "c1",
  name: "Funeral",
  purpose: "Support",
  kind: "one_time",
  status: "active",
  startYear: null,
  startMonth: null,
  expectedMonthlyMinor: null,
  collectedMinor: 0,
  takenMinor: 0,
  balanceMinor: 0,
  recordCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  fields: [
    { id: "f-name", label: "Name", orderIndex: 0 },
    { id: "f-gender", label: "Gender", orderIndex: 1 },
  ],
  ...overrides,
});

describe("creating a contribution", () => {
  it("makes the person type their own columns, and tells them what is missing", async () => {
    api.listContributions.mockResolvedValue({ items: [], totals: { collectedMinor: 0, takenMinor: 0, balanceMinor: 0 } });
    wrap(<ContributionsListPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /new contribution|create your first/i }))[0]!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /create contribution/i }));
    expect(await within(dialog).findByText(/Give the contribution a name/)).toBeTruthy();
    expect(within(dialog).getByText(/Say what the money is for/)).toBeTruthy();
    expect(within(dialog).getByText(/Choose whether this is a one-time or a monthly/)).toBeTruthy();
    expect(within(dialog).getByText(/Add at least one column/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /remove the column/i })).toBeNull(); // nothing is preselected
    expect(api.createContribution).not.toHaveBeenCalled();
  });

  it("sends the typed columns and the chosen kind", async () => {
    api.listContributions.mockResolvedValue({ items: [], totals: { collectedMinor: 0, takenMinor: 0, balanceMinor: 0 } });
    api.createContribution.mockResolvedValue({ id: "new" });
    wrap(<ContributionsListPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /new contribution|create your first/i }))[0]!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Funeral" } });
    fireEvent.change(within(dialog).getByLabelText("Purpose"), { target: { value: "Support the family" } });
    fireEvent.click(within(dialog).getByLabelText(/One time/));
    for (const column of ["Name", "Gender"]) {
      fireEvent.change(within(dialog).getByLabelText("Columns of your table"), { target: { value: column } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    }
    fireEvent.change(within(dialog).getByLabelText("Columns of your table"), { target: { value: "amount" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(within(dialog).getByText(/Amount column is added for you/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Columns of your table"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create contribution/i }));
    await waitFor(() => expect(api.createContribution).toHaveBeenCalled());
    expect(api.createContribution.mock.calls[0]![0]).toEqual({ name: "Funeral", purpose: "Support the family", kind: "one_time", fields: ["Name", "Gender"] });
  });
});

describe("the one-time table", () => {
  const rows = (items: unknown[], totalMinor: number) => ({ items, totalMinor, fields: detail().fields });

  it("shows each row with its date and time, and the running total", async () => {
    api.listRecords.mockResolvedValue(
      rows(
        [
          { id: "r1", values: { "f-name": "Musa", "f-gender": "Male" }, amountMinor: 50_000, startYear: null, startMonth: null, monthsPaid: 0, monthsDue: null, createdAt: "2026-03-01T10:00:00Z", updatedAt: "2026-03-01T10:00:00Z" },
          { id: "r2", values: { "f-name": "Fatmata" }, amountMinor: 25_050, startYear: null, startMonth: null, monthsPaid: 0, monthsDue: null, createdAt: "2026-03-02T10:00:00Z", updatedAt: "2026-03-05T12:30:00Z" },
        ],
        75_050,
      ),
    );
    wrap(<RecordsTable detail={detail()} canEdit />);
    expect(await screen.findByText("Musa")).toBeTruthy();
    expect(screen.getByText("Fatmata")).toBeTruthy();
    expect(screen.getByText("NLe 750.50", { selector: "td" })).toBeTruthy(); // the total
    expect(screen.getByText("Not changed")).toBeTruthy(); // a row never changed says so; a changed one shows its date
    expect(screen.getAllByText(/Mar 2026/).length).toBeGreaterThanOrEqual(3);
  });

  it("asks for the amount, then saves the typed values", async () => {
    api.listRecords.mockResolvedValue(rows([], 0));
    api.addRecord.mockResolvedValue({});
    wrap(<RecordsTable detail={detail()} canEdit />);
    await screen.findByText(/No rows yet/);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/Enter the amount this person gave/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1,250.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.addRecord).toHaveBeenCalledWith("c1", { values: { "f-name": "Ada" }, amountMinor: 125_050 }));
  });

  it("shows the server's reason when a row is refused", async () => {
    api.listRecords.mockResolvedValue(rows([], 0));
    api.addRecord.mockImplementation(() => Promise.reject(new ApiError("VALIDATION_ERROR", "This contribution is closed. Reopen it to make changes.", 409)));
    wrap(<RecordsTable detail={detail()} canEdit />);
    await screen.findByText(/No rows yet/);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("This contribution is closed. Reopen it to make changes.")).toBeTruthy();
  });

  it("is read-only once the contribution is closed", async () => {
    api.listRecords.mockResolvedValue(rows([], 0));
    wrap(<RecordsTable detail={detail({ status: "closed" })} canEdit={false} />);
    await screen.findByText(/No rows yet/);
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });
});

describe("the monthly tracker", () => {
  const tracker = {
    year: 2026,
    years: [2025, 2026],
    expectedMonthlyMinor: 10_000,
    fields: [{ id: "f-name", label: "Name", orderIndex: 0 }],
    members: [
      {
        id: "m1",
        values: { "f-name": "Pat" },
        startYear: 2026,
        startMonth: 1,
        cells: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          status: i === 0 ? "paid" : i === 1 ? "unpaid" : "upcoming",
          locked: i === 0,
          amountMinor: i === 0 ? 10_000 : null,
          recordedAt: i === 0 ? "2026-01-05T10:00:00Z" : null,
          updatedAt: i === 0 ? "2026-01-05T10:00:00Z" : null,
        })),
        paidMonths: 1,
        unpaidMonths: 1,
        totalMinor: 10_000,
      },
    ],
    monthTotals: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, collectedMinor: i === 0 ? 10_000 : 0, paidCount: i === 0 ? 1 : 0, unpaidCount: i === 1 ? 1 : 0, partialCount: 0, expectedMinor: 10_000 })),
    yearTotalMinor: 10_000,
    unpaidCount: 1,
    currentMonth: { year: 2026, month: 2 },
  };

  it("shows who paid and who did not, by month, with the totals", async () => {
    api.getTracker.mockResolvedValue(tracker);
    wrap(<TrackerTab detail={detail({ kind: "recurring" })} canEdit />);
    expect(await screen.findByText("Pat")).toBeTruthy();
    expect(screen.getByLabelText(/Pat, January 2026: NLe 100.00/)).toBeTruthy();
    expect(screen.getByLabelText(/Pat, February 2026: not paid/)).toBeTruthy();
    expect(screen.getByLabelText(/Pat, March 2026: not yet due/)).toBeTruthy();
    // January is over and has a payment, so it is locked; the missed February can still be filled in.
    expect((screen.getByLabelText(/Pat, January 2026: NLe 100.00/) as HTMLButtonElement).title).toMatch(/can no longer be changed/);
    expect(screen.getByText("Payments missing in 2026").nextElementSibling?.textContent).toBe("1");
  });

  it("shows a past, recorded payment as read-only, with no way to change or remove it", async () => {
    api.getTracker.mockResolvedValue(tracker);
    wrap(<TrackerTab detail={detail({ kind: "recurring" })} canEdit />);
    fireEvent.click(await screen.findByLabelText(/Pat, January 2026: NLe 100.00/));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/has passed, so this payment can no longer be changed or removed/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /remove payment/i })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /save change/i })).toBeNull();
    expect((within(dialog).getByLabelText("Amount paid") as HTMLInputElement).readOnly).toBe(true);
    expect(api.setPayment).not.toHaveBeenCalled();
  });

  it("records a payment for a month, starting from the expected amount", async () => {
    api.getTracker.mockResolvedValue(tracker);
    api.setPayment.mockResolvedValue({});
    wrap(<TrackerTab detail={detail({ kind: "recurring" })} canEdit />);
    fireEvent.click(await screen.findByLabelText(/Pat, February 2026: not paid/));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Amount paid") as HTMLInputElement).value).toBe("100");
    fireEvent.change(within(dialog).getByLabelText("Amount paid"), { target: { value: "abc" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /record payment/i }));
    expect(await within(dialog).findByText(/Enter the amount paid as a number/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Amount paid"), { target: { value: "75.5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /record payment/i }));
    await waitFor(() => expect(api.setPayment).toHaveBeenCalledWith("c1", "m1", { year: 2026, month: 2, amountMinor: 7_550 }));
  });
});
