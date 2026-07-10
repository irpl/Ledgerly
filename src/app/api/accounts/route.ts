import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { accountInput } from "@/lib/validation";
import { majorToMinor } from "@/lib/money";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  const accounts = await prisma.account.findMany({
    where: { userId, ...(includeArchived ? {} : { archived: false }) },
    include: { loanDetails: true },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ accounts: accounts.map(toAccountDTO) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = accountInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const openingBalance = BigInt(majorToMinor(data.openingBalance));

  const account = await prisma.account.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      currency: data.currency,
      openingBalance,
      currentBalance: openingBalance,
      creditLimit:
        data.type === "credit_card" && data.creditLimit != null
          ? BigInt(majorToMinor(data.creditLimit))
          : null,
      monthlyBudget:
        data.type === "credit_card" && data.monthlyBudget != null
          ? BigInt(majorToMinor(data.monthlyBudget))
          : null,
      color: data.color ?? null,
      icon: data.icon ?? null,
      loanDetails:
        data.type === "loan" && data.loanDetails
          ? {
              create: {
                loanKind: data.loanDetails.loanKind,
                originalPrincipal: BigInt(majorToMinor(data.loanDetails.originalPrincipal)),
                interestRate: data.loanDetails.interestRate,
                termMonths: data.loanDetails.termMonths,
                startDate: new Date(data.loanDetails.startDate),
                monthlyPayment: BigInt(majorToMinor(data.loanDetails.monthlyPayment)),
                monthlyBudget:
                  data.loanDetails.monthlyBudget != null
                    ? BigInt(majorToMinor(data.loanDetails.monthlyBudget))
                    : null,
                lender: data.loanDetails.lender ?? null,
                nextPaymentDate: data.loanDetails.nextPaymentDate
                  ? new Date(data.loanDetails.nextPaymentDate)
                  : null,
              },
            }
          : undefined,
    },
    include: { loanDetails: true },
  });

  return NextResponse.json({ account: toAccountDTO(account) }, { status: 201 });
}
