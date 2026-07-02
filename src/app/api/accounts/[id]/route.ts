import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeBalance, toAccountDTO } from "@/lib/accounts";
import { accountInput } from "@/lib/validation";
import { majorToMinor } from "@/lib/money";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: { loanDetails: true },
  });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ account: toAccountDTO(account) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const partial = accountInput.partial().safeParse(body);
  if (!partial.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: partial.error.issues },
      { status: 400 }
    );
  }
  const data = partial.data;
  const archived = typeof body.archived === "boolean" ? body.archived : undefined;
  const nextType = data.type ?? existing.type;

  const account = await prisma.$transaction(async (tx) => {
    // Type moved away from loan → drop loan details; away from card → drop limit.
    if (nextType !== "loan") {
      await tx.loanDetails.deleteMany({ where: { accountId: id } });
    }

    const updated = await tx.account.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        currency: data.currency,
        archived,
        openingBalance:
          data.openingBalance !== undefined
            ? BigInt(majorToMinor(data.openingBalance))
            : undefined,
        creditLimit:
          nextType !== "credit_card"
            ? null
            : data.creditLimit !== undefined
              ? data.creditLimit === null
                ? null
                : BigInt(majorToMinor(data.creditLimit))
              : undefined,
        monthlyBudget:
          nextType !== "credit_card"
            ? null
            : data.monthlyBudget !== undefined
              ? data.monthlyBudget === null
                ? null
                : BigInt(majorToMinor(data.monthlyBudget))
              : undefined,
        color: data.color !== undefined ? data.color : undefined,
        icon: data.icon !== undefined ? data.icon : undefined,
      },
    });

    if (nextType === "loan" && data.loanDetails) {
      const ld = data.loanDetails;
      const loanData = {
        loanKind: ld.loanKind,
        originalPrincipal: BigInt(majorToMinor(ld.originalPrincipal)),
        interestRate: ld.interestRate,
        termMonths: ld.termMonths,
        startDate: new Date(ld.startDate),
        monthlyPayment: BigInt(majorToMinor(ld.monthlyPayment)),
        monthlyBudget:
          ld.monthlyBudget != null ? BigInt(majorToMinor(ld.monthlyBudget)) : null,
        lender: ld.lender ?? null,
        nextPaymentDate: ld.nextPaymentDate ? new Date(ld.nextPaymentDate) : null,
      };
      await tx.loanDetails.upsert({
        where: { accountId: id },
        update: loanData,
        create: { accountId: id, ...loanData },
      });
    }

    return updated;
  });

  if (data.openingBalance !== undefined) {
    await recomputeBalance(id);
  }

  const fresh = await prisma.account.findUniqueOrThrow({
    where: { id: account.id },
    include: { loanDetails: true },
  });
  return NextResponse.json({ account: toAccountDTO(fresh) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Archive rather than delete: history stays intact.
  await prisma.account.update({ where: { id }, data: { archived: true } });
  return NextResponse.json({ ok: true });
}
