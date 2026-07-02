// Server-only budgeting helpers.
import type { Prisma } from "@/generated/prisma/client";
import type { BudgetLineDTO, FrequencyValue, PaymentMethodValue } from "@/lib/budget-shared";

type BudgetLineWithRelations = Prisma.BudgetLineGetPayload<{
  include: { category: true; fundingAccount: true };
}>;

export function toBudgetLineDTO(line: BudgetLineWithRelations): BudgetLineDTO {
  return {
    id: line.id,
    name: line.name,
    categoryId: line.categoryId,
    categoryName: line.category.name,
    amount: Number(line.amount),
    frequency: line.frequency as FrequencyValue,
    paymentMethod: line.paymentMethod as PaymentMethodValue,
    fundingAccountId: line.fundingAccountId,
    fundingAccountName: line.fundingAccount.name,
    fundingAccountCurrency: line.fundingAccount.currency,
    normalizedMonthly: Number(line.normalizedMonthly),
    active: line.active,
  };
}
