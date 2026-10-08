import { describe, it, expect } from "vitest";
import { findMatchingRule, normalizeMatchText } from "@/lib/category-rule-shared";
import type { CategoryKindValue } from "@/lib/category-shared";

const rule = (pattern: string, categoryKind: CategoryKindValue = "expense", id = pattern) => ({
  id,
  pattern,
  categoryKind,
});

describe("normalizeMatchText", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeMatchText("  HI-LO   Portmore\t#12 ")).toBe("hi-lo portmore #12");
    expect(normalizeMatchText(null)).toBe("");
  });
});

describe("findMatchingRule", () => {
  it("matches a pattern contained in the vendor or the description", () => {
    const rules = [rule("hi-lo")];
    expect(findMatchingRule(rules, ["HI-LO  PORTMORE #12", null], "out")?.id).toBe("hi-lo");
    expect(findMatchingRule(rules, [null, "Groceries at Hi-Lo"], "out")?.id).toBe("hi-lo");
    expect(findMatchingRule(rules, ["MegaMart", "weekly shop"], "out")).toBeNull();
  });

  it("prefers the longest (most specific) pattern", () => {
    const rules = [rule("amazon"), rule("amazon prime")];
    expect(findMatchingRule(rules, ["AMAZON PRIME*2K4"], "out")?.id).toBe("amazon prime");
    expect(findMatchingRule(rules, ["AMAZON MKTPL"], "out")?.id).toBe("amazon");
  });

  it("never puts a category on money moving the wrong way", () => {
    const rules = [rule("acme", "income")];
    expect(findMatchingRule(rules, ["ACME LTD"], "out")).toBeNull();
    expect(findMatchingRule(rules, ["ACME LTD"], "in")?.id).toBe("acme");
    expect(findMatchingRule([rule("acme", "both")], ["ACME LTD"], "out")?.id).toBe("acme");
  });

  it("matches nothing when there is no text", () => {
    expect(findMatchingRule([rule("x")], [null, "  "], "out")).toBeNull();
  });
});
