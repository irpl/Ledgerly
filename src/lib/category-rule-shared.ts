// Client-safe "remember this category" matching. The transaction form uses it
// to pre-fill categories and decide whether to offer the "remember" prompt;
// the email pipeline uses the same function, so both agree on what "looks the
// same" means.
import type { CategoryKindValue } from "@/lib/category-shared";

export const MAX_RULE_PATTERN_LENGTH = 200;

export type CategoryRuleDTO = {
  id: string;
  pattern: string;
  categoryId: string;
  categoryName: string;
  categoryKind: CategoryKindValue;
  matchCount: number;
};

type MatchableRule = Pick<CategoryRuleDTO, "pattern" | "categoryKind">;

/** Lowercase, trim and collapse whitespace: "  HI-LO   Portmore " → "hi-lo portmore". */
export function normalizeMatchText(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whether a category of `kind` can be used for money moving in `direction`. */
export function kindFitsDirection(kind: CategoryKindValue, direction: "out" | "in"): boolean {
  return direction === "out" ? kind !== "income" : kind !== "expense";
}

/**
 * The rule that categorizes a transaction: its pattern must appear in the
 * vendor name or the description, and its category must fit the direction
 * (an income category never lands on a purchase). The longest pattern wins,
 * so "amazon prime" beats "amazon".
 */
export function findMatchingRule<R extends MatchableRule>(
  rules: R[],
  texts: (string | null | undefined)[],
  direction: "out" | "in"
): R | null {
  const haystacks = texts.map(normalizeMatchText).filter((t) => t.length > 0);
  if (haystacks.length === 0) return null;
  let best: R | null = null;
  for (const rule of rules) {
    if (!rule.pattern || !kindFitsDirection(rule.categoryKind, direction)) continue;
    if (!haystacks.some((h) => h.includes(rule.pattern))) continue;
    if (!best || rule.pattern.length > best.pattern.length) best = rule;
  }
  return best;
}
