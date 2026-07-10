import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { minorToMajor } from "@/lib/money";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\r\n") + "\r\n";
}

function money(minor: bigint | null): string {
  return minor === null ? "" : minorToMajor(Number(minor)).toFixed(2);
}

const EXPORTERS: Record<
  string,
  (userId: string) => Promise<{ headers: string[]; rows: unknown[][] }>
> = {
  accounts: async (userId) => {
    const items = await prisma.account.findMany({
      where: { userId },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      headers: [
        "id", "name", "type", "currency", "openingBalance", "currentBalance",
        "creditLimit", "monthlyBudget", "archived", "createdAt",
      ],
      rows: items.map((a) => [
        a.id, a.name, a.type, a.currency, money(a.openingBalance), money(a.currentBalance),
        money(a.creditLimit), money(a.monthlyBudget), a.archived, a.createdAt.toISOString(),
      ]),
    };
  },
  loans: async (userId) => {
    const items = await prisma.loanDetails.findMany({
      where: { account: { userId } },
      include: { account: true },
    });
    return {
      headers: [
        "accountId", "accountName", "loanKind", "originalPrincipal", "interestRate",
        "termMonths", "startDate", "monthlyPayment", "monthlyBudget", "lender", "nextPaymentDate",
      ],
      rows: items.map((l) => [
        l.accountId, l.account.name, l.loanKind, money(l.originalPrincipal),
        l.interestRate.toString(), l.termMonths, l.startDate.toISOString().slice(0, 10),
        money(l.monthlyPayment), money(l.monthlyBudget), l.lender,
        l.nextPaymentDate?.toISOString().slice(0, 10) ?? "",
      ]),
    };
  },
  transactions: async (userId) => {
    const items = await prisma.transaction.findMany({
      where: { account: { userId } },
      include: { account: true, category: true, vendor: true },
      orderBy: { occurredAt: "asc" },
    });
    return {
      headers: [
        "id", "occurredAt", "account", "currency", "amount", "category", "vendor",
        "description", "notes", "source", "status", "transferGroupId",
      ],
      rows: items.map((t) => [
        t.id, t.occurredAt.toISOString(), t.account.name, t.account.currency,
        money(t.amount), t.category?.name, t.vendor?.name, t.description, t.notes,
        t.source, t.status, t.transferGroupId,
      ]),
    };
  },
  categories: async (userId) => {
    const items = await prisma.category.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return {
      headers: ["id", "name", "kind", "parentId", "color", "icon", "isDefault"],
      rows: items.map((c) => [c.id, c.name, c.kind, c.parentId, c.color, c.icon, c.isDefault]),
    };
  },
  vendors: async (userId) => {
    const items = await prisma.vendor.findMany({
      where: { userId },
      include: { defaultCategory: true },
      orderBy: { name: "asc" },
    });
    return {
      headers: ["id", "name", "defaultCategory", "usageCount", "lastUsedAt"],
      rows: items.map((v) => [
        v.id, v.name, v.defaultCategory?.name, v.usageCount, v.lastUsedAt?.toISOString(),
      ]),
    };
  },
  "budget-lines": async (userId) => {
    const items = await prisma.budgetLine.findMany({
      where: { userId },
      include: { category: true, fundingAccount: true },
      orderBy: { name: "asc" },
    });
    return {
      headers: [
        "id", "name", "category", "amount", "frequency", "paymentMethod",
        "fundingAccount", "currency", "normalizedMonthly", "active",
      ],
      rows: items.map((l) => [
        l.id, l.name, l.category.name, money(l.amount), l.frequency, l.paymentMethod,
        l.fundingAccount.name, l.fundingAccount.currency, money(l.normalizedMonthly), l.active,
      ]),
    };
  },
  "income-plan": async (userId) => {
    const items = await prisma.incomePlan.findMany({
      where: { userId },
      orderBy: { label: "asc" },
    });
    return {
      headers: ["id", "label", "monthlyAmount"],
      rows: items.map((i) => [i.id, i.label, money(i.monthlyAmount)]),
    };
  },
  "budget-actuals": async (userId) => {
    const items = await prisma.budgetPeriodActual.findMany({
      where: { category: { userId } },
      include: { category: true },
      orderBy: [{ periodLabel: "asc" }, { categoryId: "asc" }],
    });
    return {
      headers: ["periodLabel", "category", "budgeted", "spent"],
      rows: items.map((b) => [b.periodLabel, b.category.name, money(b.budgeted), money(b.spent)]),
    };
  },
  "parser-rules": async (userId) => {
    const items = await prisma.parserRule.findMany({
      where: { userId },
      include: { account: true },
      orderBy: { name: "asc" },
    });
    return {
      headers: ["id", "name", "senderMatch", "subjectPattern", "bodyPattern", "account", "defaultDirection"],
      rows: items.map((r) => [
        r.id, r.name, r.senderMatch, r.subjectPattern, r.bodyPattern, r.account.name, r.defaultDirection,
      ]),
    };
  },
  "raw-emails": async (userId) => {
    const items = await prisma.rawEmail.findMany({
      where: { userId },
      orderBy: { receivedAt: "asc" },
    });
    return {
      headers: ["id", "fromAddress", "subject", "receivedAt", "parseStatus", "createdTransactionId", "body"],
      rows: items.map((e) => [
        e.id, e.fromAddress, e.subject, e.receivedAt.toISOString(), e.parseStatus,
        e.createdTransactionId, e.body,
      ]),
    };
  },
};

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entity = req.nextUrl.searchParams.get("entity") ?? "";
  const exporter = EXPORTERS[entity];
  if (!exporter) {
    return NextResponse.json(
      { error: `Unknown entity. One of: ${Object.keys(EXPORTERS).join(", ")}` },
      { status: 400 }
    );
  }
  const { headers, rows } = await exporter(userId);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entity}-${stamp}.csv"`,
    },
  });
}
