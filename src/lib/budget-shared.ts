// Client-safe budgeting types and the frequency-normalization rule (§5.4).

export const FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;

export type FrequencyValue = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<FrequencyValue, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  bimonthly: "Every 2 months",
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Annual",
};

export const OCCURRENCES_PER_YEAR: Record<FrequencyValue, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  bimonthly: 6,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

/** True 12-month calendar: annualize by frequency, divide by 12 (minor units in, minor units out). */
export function normalizedMonthly(amountMinor: number, frequency: FrequencyValue): number {
  return Math.round((amountMinor * OCCURRENCES_PER_YEAR[frequency]) / 12);
}

export const PAYMENT_METHODS = ["cash", "credit"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export type BudgetLineDTO = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  amount: number; // minor units
  frequency: FrequencyValue;
  paymentMethod: PaymentMethodValue;
  fundingAccountId: string;
  fundingAccountName: string;
  fundingAccountCurrency: string;
  normalizedMonthly: number; // minor units
  active: boolean;
};

export type IncomePlanDTO = {
  id: string;
  label: string;
  monthlyAmount: number; // minor units
};
