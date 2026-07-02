import { z } from "zod";
import { ACCOUNT_TYPES, LOAN_KINDS } from "@/lib/account-shared";
import { CATEGORY_KINDS } from "@/lib/category-shared";
import { FREQUENCIES, PAYMENT_METHODS } from "@/lib/budget-shared";

// Amounts arrive from forms in major units (e.g. 1234.56) and are
// converted to integer minor units at the API boundary.

export const loanDetailsInput = z.object({
  loanKind: z.enum(LOAN_KINDS),
  originalPrincipal: z.number().nonnegative(),
  interestRate: z.number().min(0).max(100),
  termMonths: z.number().int().positive(),
  startDate: z.string().min(1),
  monthlyPayment: z.number().nonnegative(),
  monthlyBudget: z.number().nonnegative().nullish(),
  lender: z.string().trim().max(200).nullish(),
  nextPaymentDate: z.string().nullish(),
});

export const accountInput = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(ACCOUNT_TYPES),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  openingBalance: z.number(),
  creditLimit: z.number().positive().nullish(),
  monthlyBudget: z.number().nonnegative().nullish(),
  color: z.string().trim().max(50).nullish(),
  icon: z.string().trim().max(50).nullish(),
  loanDetails: loanDetailsInput.nullish(),
});

export type AccountInput = z.infer<typeof accountInput>;

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(CATEGORY_KINDS),
  parentId: z.string().nullish(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  icon: z.string().trim().max(50).nullish(),
});

export type CategoryInput = z.infer<typeof categoryInput>;

export const transactionInput = z.object({
  accountId: z.string().min(1),
  // Positive major-unit amount; `direction` sets the sign.
  amount: z.number().positive(),
  direction: z.enum(["out", "in"]),
  occurredAt: z.string().min(1), // ISO datetime (local date + time from the form)
  categoryId: z.string().nullish(),
  vendorName: z.string().trim().max(200).nullish(),
  description: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export type TransactionInput = z.infer<typeof transactionInput>;

export const transferInput = z
  .object({
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    // Amount leaving the source account, in its major units.
    amount: z.number().positive(),
    // Amount arriving at the destination; required when currencies differ.
    toAmount: z.number().positive().nullish(),
    occurredAt: z.string().min(1),
    description: z.string().trim().max(500).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Source and destination must differ",
    path: ["toAccountId"],
  });

export type TransferInput = z.infer<typeof transferInput>;

export const budgetLineInput = z.object({
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().min(1),
  amount: z.number().positive(), // major units
  frequency: z.enum(FREQUENCIES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  fundingAccountId: z.string().min(1),
  active: z.boolean().optional(),
});

export type BudgetLineInput = z.infer<typeof budgetLineInput>;

export const incomePlanInput = z.object({
  label: z.string().trim().min(1).max(200),
  monthlyAmount: z.number().nonnegative(), // major units
});

export type IncomePlanInput = z.infer<typeof incomePlanInput>;

function validRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export const parserRuleInput = z.object({
  name: z.string().trim().min(1).max(200),
  senderMatch: z.string().trim().min(1).max(500),
  subjectPattern: z
    .string()
    .trim()
    .max(1000)
    .refine(validRegex, "Not a valid regular expression")
    .nullish()
    .or(z.literal("").transform(() => null)),
  bodyPattern: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine(validRegex, "Not a valid regular expression")
    .refine(
      (p) => p.includes("(?<amount>"),
      "Body pattern must contain a named group (?<amount>…)"
    ),
  accountId: z.string().min(1),
  defaultDirection: z.enum(["outflow", "inflow"]),
});

export type ParserRuleInput = z.infer<typeof parserRuleInput>;
