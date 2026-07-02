import { describe, it, expect } from "vitest";
import {
  accountInput,
  transactionInput,
  transferInput,
  parserRuleInput,
  budgetLineInput,
} from "@/lib/validation";

describe("accountInput", () => {
  it("uppercases the currency", () => {
    const parsed = accountInput.parse({
      name: "NCB",
      type: "checking",
      currency: "jmd",
      openingBalance: 100,
    });
    expect(parsed.currency).toBe("JMD");
  });

  it("rejects unknown account types", () => {
    expect(
      accountInput.safeParse({ name: "x", type: "bitcoin", currency: "JMD", openingBalance: 0 })
        .success
    ).toBe(false);
  });
});

describe("transactionInput", () => {
  it("requires a positive amount (sign comes from direction)", () => {
    const base = { accountId: "a", direction: "out", occurredAt: "2026-07-02T10:00:00" };
    expect(transactionInput.safeParse({ ...base, amount: -5 }).success).toBe(false);
    expect(transactionInput.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(transactionInput.safeParse({ ...base, amount: 5 }).success).toBe(true);
  });
});

describe("transferInput", () => {
  it("rejects same-account transfers", () => {
    const result = transferInput.safeParse({
      fromAccountId: "a",
      toAccountId: "a",
      amount: 100,
      occurredAt: "2026-07-02T10:00:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("parserRuleInput", () => {
  const base = {
    name: "rule",
    senderMatch: "bank.com",
    accountId: "a",
    defaultDirection: "outflow",
  };

  it("requires a named amount group in the body pattern", () => {
    expect(
      parserRuleInput.safeParse({ ...base, bodyPattern: String.raw`debited [\d,.]+` }).success
    ).toBe(false);
    expect(
      parserRuleInput.safeParse({ ...base, bodyPattern: String.raw`(?<amount>[\d,.]+)` }).success
    ).toBe(true);
  });

  it("rejects invalid regex", () => {
    expect(
      parserRuleInput.safeParse({ ...base, bodyPattern: "(?<amount>[unclosed" }).success
    ).toBe(false);
  });
});

describe("budgetLineInput", () => {
  it("accepts the full frequency enum", () => {
    for (const frequency of ["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"]) {
      expect(
        budgetLineInput.safeParse({
          name: "x",
          categoryId: "c",
          amount: 10,
          frequency,
          paymentMethod: "cash",
          fundingAccountId: "a",
        }).success
      ).toBe(true);
    }
  });
});
