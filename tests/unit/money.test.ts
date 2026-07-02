import { describe, it, expect } from "vitest";
import { majorToMinor, minorToMajor, formatMoney, amountClass } from "@/lib/money";

describe("majorToMinor", () => {
  it("converts dollars to cents", () => {
    expect(majorToMinor(1234.56)).toBe(123456);
    expect(majorToMinor(0)).toBe(0);
    expect(majorToMinor(-45.5)).toBe(-4550);
  });

  it("rounds floating-point artifacts correctly", () => {
    expect(majorToMinor(19.99)).toBe(1999);
    expect(majorToMinor(0.1 + 0.2)).toBe(30);
    expect(majorToMinor(4512.35)).toBe(451235);
  });
});

describe("minorToMajor", () => {
  it("inverts majorToMinor", () => {
    expect(minorToMajor(123456)).toBe(1234.56);
    expect(minorToMajor(-451235)).toBe(-4512.35);
    expect(minorToMajor(BigInt(500))).toBe(5);
  });
});

describe("formatMoney", () => {
  it("shows negative with a leading minus and the currency code", () => {
    const out = formatMoney(-451235, "JMD");
    expect(out).toContain("-");
    expect(out).toContain("4,512.35");
    expect(out).toContain("JMD");
  });

  it("adds + only when sign option is set", () => {
    expect(formatMoney(100, "JMD")).not.toContain("+");
    expect(formatMoney(100, "JMD", { sign: true })).toContain("+");
    expect(formatMoney(-100, "JMD", { sign: true })).toContain("-");
  });
});

describe("amountClass", () => {
  it("maps sign to color class per the spec (out red, in green)", () => {
    expect(amountClass(-1)).toContain("negative");
    expect(amountClass(1)).toContain("positive");
    expect(amountClass(0)).toContain("zero");
  });
});
