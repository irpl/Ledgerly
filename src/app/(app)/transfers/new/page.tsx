import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/current-user";
import { toAccountDTO } from "@/lib/accounts";
import { TransferForm } from "@/components/transfer-form";

export const dynamic = "force-dynamic";

export default async function NewTransferPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const userId = await requireUserId();
  const searchParams = await props.searchParams;
  const accounts = await prisma.account.findMany({
    where: { userId, archived: false },
    include: { loanDetails: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New transfer</h1>
      {accounts.length < 2 ? (
        <p className="text-muted">You need at least two accounts to make a transfer.</p>
      ) : (
        <TransferForm
          accounts={accounts.map(toAccountDTO)}
          initialFromId={searchParams.from}
          initialToId={searchParams.to}
        />
      )}
    </div>
  );
}
