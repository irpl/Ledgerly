// Client-safe account constants, types, and pure helpers.
// No Prisma imports here — this module is bundled into client components.

export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "loan",
  "investment",
  "pension",
  "ewallet",
  "other",
] as const;

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountTypeValue, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  credit_card: "Credit card",
  loan: "Loan",
  investment: "Investment",
  pension: "Pension",
  ewallet: "E-wallet",
  other: "Other",
};

export const LOAN_KINDS = ["mortgage", "auto", "bank", "personal", "other"] as const;
export type LoanKindValue = (typeof LOAN_KINDS)[number];

export const LIABILITY_TYPES: AccountTypeValue[] = ["credit_card", "loan"];

export type LoanDetailsDTO = {
  loanKind: LoanKindValue;
  originalPrincipal: number;
  interestRate: number;
  termMonths: number;
  startDate: string;
  monthlyPayment: number;
  monthlyBudget: number | null;
  lender: string | null;
  nextPaymentDate: string | null;
};

export type AccountDTO = {
  id: string;
  name: string;
  type: AccountTypeValue;
  currency: string;
  openingBalance: number; // minor units, signed
  currentBalance: number; // minor units, signed
  creditLimit: number | null;
  monthlyBudget: number | null;
  color: string | null;
  icon: string | null;
  archived: boolean;
  createdAt: string;
  loanDetails: LoanDetailsDTO | null;
};

/** Net worth per currency over non-archived accounts (liabilities already negative). */
export function totalsByCurrency(accounts: AccountDTO[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const a of accounts) {
    if (a.archived) continue;
    totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.currentBalance);
  }
  return totals;
}

/** Available credit = creditLimit + currentBalance (balance negative when owed). */
export function availableCredit(account: AccountDTO): number | null {
  if (account.type !== "credit_card" || account.creditLimit === null) return null;
  return account.creditLimit + account.currentBalance;
}

/** Payoff progress = 1 − (remaining ÷ originalPrincipal), clamped to [0, 1]. */
export function payoffProgress(account: AccountDTO): number | null {
  if (account.type !== "loan" || !account.loanDetails) return null;
  const { originalPrincipal } = account.loanDetails;
  if (originalPrincipal <= 0) return null;
  const remaining = Math.abs(Math.min(account.currentBalance, 0));
  return Math.min(1, Math.max(0, 1 - remaining / originalPrincipal));
}
