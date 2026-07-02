"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountDTO, AccountTypeValue, LoanKindValue } from "@/lib/account-shared";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, LOAN_KINDS, LIABILITY_TYPES } from "@/lib/account-shared";
import { minorToMajor } from "@/lib/money";

const inputCls =
  "input";
const labelCls = "block text-sm font-medium mb-1";

const LOAN_KIND_LABELS: Record<LoanKindValue, string> = {
  mortgage: "Mortgage",
  auto: "Auto",
  bank: "Bank loan",
  personal: "Personal",
  other: "Other",
};

function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function AccountForm({ account }: { account?: AccountDTO }) {
  const router = useRouter();
  const isEdit = !!account;

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountTypeValue>(account?.type ?? "checking");
  const [currency, setCurrency] = useState(account?.currency ?? "JMD");
  const [icon, setIcon] = useState(account?.icon ?? "");
  const isLiability = LIABILITY_TYPES.includes(type);
  const [balanceStr, setBalanceStr] = useState(() => {
    if (!account) return "";
    const major = minorToMajor(account.openingBalance);
    return String(LIABILITY_TYPES.includes(account.type) ? Math.abs(major) : major);
  });
  const [creditLimitStr, setCreditLimitStr] = useState(
    account?.creditLimit != null ? String(minorToMajor(account.creditLimit)) : ""
  );
  const [cardBudgetStr, setCardBudgetStr] = useState(
    account?.monthlyBudget != null ? String(minorToMajor(account.monthlyBudget)) : ""
  );

  const ld = account?.loanDetails;
  const [loanKind, setLoanKind] = useState<LoanKindValue>(ld?.loanKind ?? "bank");
  const [principalStr, setPrincipalStr] = useState(
    ld ? String(minorToMajor(ld.originalPrincipal)) : ""
  );
  const [rateStr, setRateStr] = useState(ld ? String(ld.interestRate) : "");
  const [termStr, setTermStr] = useState(ld ? String(ld.termMonths) : "");
  const [startDate, setStartDate] = useState(toDateInput(ld?.startDate));
  const [paymentStr, setPaymentStr] = useState(ld ? String(minorToMajor(ld.monthlyPayment)) : "");
  const [budgetStr, setBudgetStr] = useState(
    ld?.monthlyBudget != null ? String(minorToMajor(ld.monthlyBudget)) : ""
  );
  const [lender, setLender] = useState(ld?.lender ?? "");
  const [nextPaymentDate, setNextPaymentDate] = useState(toDateInput(ld?.nextPaymentDate));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rawBalance = parseFloat(balanceStr || "0");
    if (Number.isNaN(rawBalance)) {
      setError("Balance must be a number.");
      return;
    }
    // Liabilities: the user enters the amount owed as a positive number;
    // it is stored negative per the sign convention.
    const openingBalance = isLiability ? -Math.abs(rawBalance) : rawBalance;

    const payload: Record<string, unknown> = {
      name,
      type,
      currency,
      openingBalance,
      icon: icon || null,
    };

    if (type === "credit_card") {
      const limit = parseFloat(creditLimitStr);
      if (Number.isNaN(limit) || limit <= 0) {
        setError("Credit limit must be a positive number.");
        return;
      }
      payload.creditLimit = limit;
      payload.monthlyBudget = cardBudgetStr ? parseFloat(cardBudgetStr) : null;
    }

    if (type === "loan") {
      const principal = parseFloat(principalStr);
      const rate = parseFloat(rateStr || "0");
      const term = parseInt(termStr, 10);
      const payment = parseFloat(paymentStr || "0");
      if (Number.isNaN(principal) || principal < 0) {
        setError("Original principal must be a number.");
        return;
      }
      if (Number.isNaN(term) || term <= 0) {
        setError("Term (months) must be a positive whole number.");
        return;
      }
      if (!startDate) {
        setError("Start date is required for loans.");
        return;
      }
      payload.loanDetails = {
        loanKind,
        originalPrincipal: principal,
        interestRate: Number.isNaN(rate) ? 0 : rate,
        termMonths: term,
        startDate,
        monthlyPayment: Number.isNaN(payment) ? 0 : payment,
        monthlyBudget: budgetStr ? parseFloat(budgetStr) : null,
        lender: lender || null,
        nextPaymentDate: nextPaymentDate || null,
      };
    }

    setSaving(true);
    const res = await fetch(isEdit ? `/api/accounts/${account.id}` : "/api/accounts", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    router.push("/accounts");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label htmlFor="name" className={labelCls}>
          Name
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          placeholder="e.g. NCB, Cash, JMMB USD"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="type" className={labelCls}>
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountTypeValue)}
            className={inputCls}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="currency" className={labelCls}>
            Currency
          </label>
          <input
            id="currency"
            required
            maxLength={3}
            list="currency-options"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={inputCls}
          />
          <datalist id="currency-options">
            <option value="JMD" />
            <option value="USD" />
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="balance" className={labelCls}>
            {isLiability ? "Amount owed" : "Opening balance"}
          </label>
          <input
            id="balance"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={balanceStr}
            onChange={(e) => setBalanceStr(e.target.value)}
            className={inputCls}
            placeholder="0.00"
          />
          {isLiability && (
            <p className="text-xs text-muted mt-1">
              Enter what you owe as a positive number — it is stored as a negative balance.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="icon" className={labelCls}>
            Icon (emoji, optional)
          </label>
          <input
            id="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className={inputCls}
            placeholder="🏦"
          />
        </div>
      </div>

      {type === "credit_card" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="creditLimit" className={labelCls}>
              Credit limit
            </label>
            <input
              id="creditLimit"
              type="number"
              step="0.01"
              inputMode="decimal"
              required
              value={creditLimitStr}
              onChange={(e) => setCreditLimitStr(e.target.value)}
              className={inputCls}
              placeholder="500000.00"
            />
          </div>
          <div>
            <label htmlFor="cardBudget" className={labelCls}>
              Monthly budget (optional)
            </label>
            <input
              id="cardBudget"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={cardBudgetStr}
              onChange={(e) => setCardBudgetStr(e.target.value)}
              className={inputCls}
              placeholder="30000.00"
            />
          </div>
        </div>
      )}

      {type === "loan" && (
        <fieldset className="card space-y-4">
          <legend className="text-sm font-semibold px-1">Loan details</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="loanKind" className={labelCls}>
                Kind
              </label>
              <select
                id="loanKind"
                value={loanKind}
                onChange={(e) => setLoanKind(e.target.value as LoanKindValue)}
                className={inputCls}
              >
                {LOAN_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LOAN_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lender" className={labelCls}>
                Lender (optional)
              </label>
              <input
                id="lender"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="principal" className={labelCls}>
                Original principal
              </label>
              <input
                id="principal"
                type="number"
                step="0.01"
                inputMode="decimal"
                required
                value={principalStr}
                onChange={(e) => setPrincipalStr(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="rate" className={labelCls}>
                Interest rate %
              </label>
              <input
                id="rate"
                type="number"
                step="0.001"
                inputMode="decimal"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="term" className={labelCls}>
                Term (months)
              </label>
              <input
                id="term"
                type="number"
                step="1"
                inputMode="numeric"
                required
                value={termStr}
                onChange={(e) => setTermStr(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="startDate" className={labelCls}>
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="payment" className={labelCls}>
                Monthly payment
              </label>
              <input
                id="payment"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={paymentStr}
                onChange={(e) => setPaymentStr(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="budget" className={labelCls}>
                Monthly budget (optional)
              </label>
              <input
                id="budget"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={budgetStr}
                onChange={(e) => setBudgetStr(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="nextPayment" className={labelCls}>
                Next payment date (optional)
              </label>
              <input
                id="nextPayment"
                type="date"
                value={nextPaymentDate}
                onChange={(e) => setNextPaymentDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </fieldset>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary px-5"
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-ghost px-5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
