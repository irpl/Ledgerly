"use client";

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import type { CategoryDTO } from "@/lib/category-shared";
import {
  findMatchingRule,
  MAX_RULE_PATTERN_LENGTH,
  normalizeMatchText,
  type CategoryRuleDTO,
} from "@/lib/category-rule-shared";

/**
 * State for the "Remember this category?" prompt shared by the transaction
 * form and the Review queue. The match text follows the vendor (or
 * description) until the user edits it, e.g. to shorten it.
 */
export function useRememberCategory({
  rules,
  categories,
  categoryId,
  vendorName,
  description,
  direction,
}: {
  rules: CategoryRuleDTO[];
  categories: CategoryDTO[];
  categoryId: string;
  vendorName: string | null;
  description: string | null;
  direction: "out" | "in";
}) {
  const [checked, setChecked] = useState(false);
  const [editedPattern, setEditedPattern] = useState<string | null>(null);

  // What a remembered rule would file this transaction under, if anything.
  const matchedRule = findMatchingRule(rules, [vendorName, description], direction);
  const defaultPattern = normalizeMatchText(vendorName) || normalizeMatchText(description);
  const pattern = editedPattern ?? defaultPattern;
  const category = categories.find((c) => c.id === categoryId) ?? null;
  // Ask only when the choice isn't already remembered.
  const offer = !!category && !!defaultPattern && matchedRule?.categoryId !== categoryId;
  const replaces = offer
    ? (rules.find((r) => r.pattern === normalizeMatchText(pattern)) ?? null)
    : null;
  const active = offer && checked;

  return {
    offer,
    category,
    checked,
    setChecked,
    pattern,
    setPattern: setEditedPattern,
    replaces,
    /** Set when the user ticked the box but cleared the match text. */
    invalid: active && !normalizeMatchText(pattern),
    /** The `rememberCategory` field for the API body. */
    payload: active ? { pattern } : null,
  };
}

export type RememberCategoryState = ReturnType<typeof useRememberCategory>;

export function RememberCategoryPrompt({
  state,
  idPrefix,
  compact = false,
}: {
  state: RememberCategoryState;
  idPrefix: string;
  compact?: boolean;
}) {
  if (!state.offer || !state.category) return null;
  const patternId = `${idPrefix}-remember-pattern`;
  return (
    <div className={`rounded-lg border border-border-subtle space-y-3 ${compact ? "p-2.5" : "p-3"}`}>
      <label className="flex items-start gap-2.5 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={state.checked}
          onChange={(e) => state.setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <BookmarkPlus size={15} aria-hidden className="text-accent" />
            Remember this category?
          </span>
          <span className="block text-xs text-muted mt-0.5">
            Transactions that come in later looking like this will be filed under{" "}
            <span className="text-foreground">{state.category.name}</span> automatically.
            {state.replaces &&
              ` This replaces the rule that files them under ${state.replaces.categoryName}.`}
          </span>
        </span>
      </label>
      {state.checked && (
        <div>
          <label htmlFor={patternId} className="label">
            Match when the vendor or description contains
          </label>
          <input
            id={patternId}
            value={state.pattern}
            onChange={(e) => state.setPattern(e.target.value)}
            maxLength={MAX_RULE_PATTERN_LENGTH}
            className="input amount"
            autoComplete="off"
          />
          <p className="text-xs text-muted mt-1">
            Not case-sensitive. Shorten it to catch variations — e.g. “hi-lo” also matches
            “HI-LO PORTMORE #12”.
          </p>
        </div>
      )}
    </div>
  );
}
