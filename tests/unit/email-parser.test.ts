import { describe, it, expect } from "vitest";
import { parseAmount, parseEmailDate, htmlToText } from "@/lib/email-parser";

describe("parseAmount", () => {
  it("strips currency symbols and thousands separators", () => {
    expect(parseAmount("JMD 4,512.35")).toBe(451235);
    expect(parseAmount("$1,000.00")).toBe(100000);
    expect(parseAmount("312.98")).toBe(31298);
  });

  it("rejects garbage, zero, and empty input", () => {
    expect(parseAmount("no digits here")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0.00")).toBeNull();
  });
});

describe("parseEmailDate", () => {
  it("parses dd-MMM-yyyy bank format", () => {
    const d = parseEmailDate("02-Jul-2026");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(2);
  });

  it("parses ISO yyyy-mm-dd", () => {
    const d = parseEmailDate("2026-07-02");
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(2);
  });

  it("parses dd/mm/yyyy as day-first (JM convention)", () => {
    const d = parseEmailDate("02/07/2026");
    expect(d?.getMonth()).toBe(6); // July, not February
    expect(d?.getDate()).toBe(2);
  });

  it("returns null for unparseable input", () => {
    expect(parseEmailDate("not a date")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("strips tags, scripts, styles and decodes entities", () => {
    const html =
      "<html><style>.x{color:red}</style><body><p>Debited <b>JMD&nbsp;500.00</b></p>" +
      "<script>alert(1)</script><div>at HI-LO &amp; CO</div></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("Debited");
    expect(text).toContain("JMD 500.00");
    expect(text).toContain("HI-LO & CO");
    expect(text).not.toContain("<");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });
});
