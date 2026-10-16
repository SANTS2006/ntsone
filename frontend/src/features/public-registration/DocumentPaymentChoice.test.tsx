import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormField } from "@/types/api";
import { ThemeProvider } from "@/app/ThemeContext";
import { DynamicForm } from "./DynamicForm";

const field = {
  id: "f1",
  formId: "form1",
  sectionId: null,
  fieldKey: "full_name",
  type: "text",
  label: "Full name",
  description: null,
  placeholder: null,
  helpText: null,
  required: false,
  orderIndex: 0,
  config: {},
  conditionalLogic: null,
} as unknown as FormField;

const lines = [
  { id: "registration", name: "Registration fee", amountMinor: 5_000 },
  { id: "id_card", name: "ID card", amountMinor: 2_000 },
];

const open = (payment: { enabled: boolean; allowPayInPerson?: boolean; lines: typeof lines }, onSubmit = vi.fn(async () => undefined)) => {
  render(
    <ThemeProvider>
      <MemoryRouter>
        <DynamicForm sections={[]} fields={[field]} onSubmit={onSubmit} payment={payment} layoutMode="single" requireReviewConfirmation={false} />
      </MemoryRouter>
    </ThemeProvider>,
  );
  return onSubmit;
};

const submit = () => fireEvent.click(screen.getByRole("button", { name: /submit and pay|submit registration/i }));

describe("choosing how to get the ID card or ticket on the registration form", () => {
  afterEach(cleanup);

  it("asks, and pays for everything online by default", async () => {
    const onSubmit = open({ enabled: true, allowPayInPerson: true, lines });
    expect(screen.getByText(/How would you like to get your ID card/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /submit and pay NLe 70/i })).toBeTruthy();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // The last argument says whether they will buy in person: not chosen.
    expect((onSubmit.mock.calls[0] as unknown[])[4]).toBeUndefined();
  });

  it("lets them just register: only the registration fee is charged, and the server is told", async () => {
    const onSubmit = open({ enabled: true, allowPayInPerson: true, lines });
    fireEvent.click(screen.getByLabelText(/I will buy my ID card in person/));
    expect(screen.getByRole("button", { name: /submit and pay NLe 50/i })).toBeTruthy();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect((onSubmit.mock.calls[0] as unknown[])[4]).toBe(true);
  });

  it("needs no payment at all when there is no registration fee and they buy in person", async () => {
    const onSubmit = open({ enabled: true, allowPayInPerson: true, lines: [lines[1]!] });
    fireEvent.click(screen.getByLabelText(/I will buy my ID card in person/));
    expect(screen.queryByRole("button", { name: /submit and pay/i })).toBeNull();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect((onSubmit.mock.calls[0] as unknown[])[4]).toBe(true);
  });

  it("does not ask when the admin has not allowed it, or when nothing is priced for a card or ticket", () => {
    open({ enabled: true, allowPayInPerson: false, lines });
    expect(screen.queryByText(/How would you like to get your/)).toBeNull();
    cleanup();
    open({ enabled: true, allowPayInPerson: true, lines: [lines[0]!] });
    expect(screen.queryByText(/How would you like to get your/)).toBeNull();
  });
});
