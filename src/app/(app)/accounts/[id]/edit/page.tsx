import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { AccountForm } from "@/components/account-form";

export const dynamic = "force-dynamic";

export default async function EditAccountPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: { loanDetails: true },
  });
  if (!account) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit {account.name}</h1>
      <AccountForm account={toAccountDTO(account)} />
    </div>
  );
}

