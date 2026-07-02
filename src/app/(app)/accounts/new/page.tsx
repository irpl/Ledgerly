import { AccountForm } from "@/components/account-form";

export default function NewAccountPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New account</h1>
      <AccountForm />
    </div>
  );
}
