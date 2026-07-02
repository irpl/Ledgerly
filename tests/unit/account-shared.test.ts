import { describe, it, expect } from "vitest";
import {
  availableCredit,
  payoffProgress,
  totalsByCurrency,
  type AccountDTO,
} from "@/lib/account-shared";

function account(overrides: Partial<AccountDTO>): AccountDTO {
  return {
    id: "a1",
    name: "Test",
    type: "checking",
    currency: "JMD",
    openingBalance: 0,
    currentBalance: 0,
    creditLimit: null,
    monthlyBudget: null,
    color: null,
    icon: null,
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    loanDetails: null,
    ...overrides,
  };
}

describe("availableCredit (spec §3.2: available = limit + balance)", () => {
  it("reproduces the spec example: limit 500,000, owed 240,611.23 → 259,388.77", () => {
    const card = account({
      type: "credit_card",
      creditLimit: 50_000_000,
      currentBalance: -24_061_123,
    });
    expect(availableCredit(card)).toBe(25_938_877);
  });

  it("returns null for non-cards and cards without a limit", () => {
    expect(availableCredit(account({ type: "checking" }))).toBeNull();
    expect(availableCredit(account({ type: "credit_card", creditLimit: null }))).toBeNull();
  });
});

describe("payoffProgress (1 − remaining ÷ principal)", () => {
  const loan = (balance: number, principal: number) =>
    account({
      type: "loan",
      currentBalance: balance,
      loanDetails: {
        loanKind: "auto",
        originalPrincipal: principal,
        interestRate: 7.5,
        termMonths: 72,
        startDate: "2024-03-01T00:00:00.000Z",
        monthlyPayment: 4_500_000,
        monthlyBudget: null,
        lender: null,
        nextPaymentDate: null,
      },
    });

  it("computes 25% for 1.8M remaining of 2.4M", () => {
    expect(payoffProgress(loan(-180_000_000, 240_000_000))).toBeCloseTo(0.25);
  });

  it("clamps to [0, 1] and handles a paid-off loan", () => {
    expect(payoffProgress(loan(0, 240_000_000))).toBe(1);
    expect(payoffProgress(loan(-300_000_000, 240_000_000))).toBe(0);
  });

  it("returns null without loan details or zero principal", () => {
    expect(payoffProgress(account({ type: "loan" }))).toBeNull();
    expect(payoffProgress(loan(-100, 0))).toBeNull();
  });
});

describe("totalsByCurrency", () => {
  it("groups by currency and skips archived accounts", () => {
    const totals = totalsByCurrency([
      account({ currency: "JMD", currentBalance: 10_000 }),
      account({ id: "a2", currency: "JMD", currentBalance: -4_000 }),
      account({ id: "a3", currency: "USD", currentBalance: 250_000 }),
      account({ id: "a4", currency: "JMD", currentBalance: 999_999, archived: true }),
    ]);
    expect(totals.get("JMD")).toBe(6_000);
    expect(totals.get("USD")).toBe(250_000);
    expect(totals.size).toBe(2);
  });
});
