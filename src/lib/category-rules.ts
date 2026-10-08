// Server-only "remember this category" rules (see category-rule-shared.ts for
// the matching itself).
import type { Prisma } from "@/generated/prisma/client";
import type { CategoryKindValue } from "@/lib/category-shared";
import {
  findMatchingRule,
  normalizeMatchText,
  type CategoryRuleDTO,
} from "@/lib/category-rule-shared";

type RuleWithCategory = Prisma.CategoryRuleGetPayload<{ include: { category: true } }>;

export function toCategoryRuleDTO(r: RuleWithCategory): CategoryRuleDTO {
  return {
    id: r.id,
    pattern: r.pattern,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    categoryKind: r.category.kind as CategoryKindValue,
    matchCount: r.matchCount,
  };
}

export async function listCategoryRules(
  db: Prisma.TransactionClient,
  userId: string
): Promise<CategoryRuleDTO[]> {
  const rules = await db.categoryRule.findMany({
    where: { userId },
    include: { category: true },
    orderBy: { pattern: "asc" },
  });
  return rules.map(toCategoryRuleDTO);
}

/**
 * The category a rule assigns to an incoming transaction, or null. Bumps the
 * winning rule's matchCount so /categories can show which rules earn their keep.
 */
export async function autoCategorize(
  db: Prisma.TransactionClient,
  userId: string,
  texts: (string | null | undefined)[],
  direction: "out" | "in"
): Promise<string | null> {
  const rule = findMatchingRule(await listCategoryRules(db, userId), texts, direction);
  if (!rule) return null;
  await db.categoryRule.update({
    where: { id: rule.id },
    data: { matchCount: { increment: 1 } },
  });
  return rule.categoryId;
}

/**
 * Save (or repoint) the rule "pattern → category", then file any uncategorized
 * transactions still waiting in Review that it matches, so the queue doesn't
 * keep asking about the same merchant. Returns how many were filed, or null
 * when the pattern is blank. The caller must have checked category ownership.
 */
export async function rememberCategory(
  db: Prisma.TransactionClient,
  userId: string,
  rawPattern: string,
  categoryId: string
): Promise<{ ruleId: string; applied: number } | null> {
  const pattern = normalizeMatchText(rawPattern);
  if (!pattern) return null;
  const rule = await db.categoryRule.upsert({
    where: { userId_pattern: { userId, pattern } },
    update: { categoryId },
    create: { userId, pattern, categoryId },
    include: { category: true },
  });
  const dto = toCategoryRuleDTO(rule);

  const pending = await db.transaction.findMany({
    where: {
      account: { userId },
      status: "pending_review",
      categoryId: null,
      transferGroupId: null,
    },
    include: { vendor: true },
  });
  // Only this rule is considered: an older, longer rule already had its
  // chance when those transactions arrived.
  const ids = pending
    .filter((t) =>
      findMatchingRule([dto], [t.vendor?.name, t.description], t.amount < 0n ? "out" : "in")
    )
    .map((t) => t.id);
  if (ids.length > 0) {
    await db.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId } });
    await db.categoryRule.update({
      where: { id: rule.id },
      data: { matchCount: { increment: ids.length } },
    });
  }
  return { ruleId: rule.id, applied: ids.length };
}
