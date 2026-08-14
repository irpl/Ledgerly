// Money is stored as signed integer minor units (cents).
// Out is negative, in is positive.

export function minorToMajor(minor: bigint | number): number {
  return Number(minor) / 100;
}

export function majorToMinor(major: number): number {
  return Math.round(major * 100);
}

/**
 * `code: false` drops the trailing currency code — for tables that state the
 * currency once in the column header instead of on every row.
 */
export function formatMoney(
  minor: bigint | number,
  currency: string,
  opts?: { sign?: boolean; code?: boolean }
): string {
  const value = minorToMajor(minor);
  const formatted = new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(Math.abs(value));
  const prefix = value < 0 ? "-" : opts?.sign && value > 0 ? "+" : "";
  const suffix = opts?.code === false ? "" : ` ${currency}`;
  return `${prefix}${formatted}${suffix}`;
}

/** CSS class for signed amounts: negative red, positive green. */
export function amountClass(minor: bigint | number): string {
  const v = Number(minor);
  if (v < 0) return "amount amount-negative";
  if (v > 0) return "amount amount-positive";
  return "amount amount-zero";
}
