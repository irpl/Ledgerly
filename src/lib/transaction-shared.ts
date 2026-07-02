// Client-safe transaction types.

export type TransactionDTO = {
  id: string;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  amount: number; // minor units, signed: out negative, in positive
  occurredAt: string;
  categoryId: string | null;
  categoryName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  description: string | null;
  notes: string | null;
  source: "manual" | "email";
  status: "confirmed" | "pending_review";
  transferGroupId: string | null;
};

export type VendorSuggestion = {
  id: string;
  name: string;
  defaultCategoryId: string | null;
};
