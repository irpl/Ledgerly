import { describe, it, expect } from "vitest";
import { parseAmount, parseEmailDate, htmlToText, parseRawMime } from "@/lib/email-parser";

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

describe("parseRawMime", () => {
  const CRLF = "\r\n";

  it("extracts clean text/from/subject from a multipart quoted-printable message", async () => {
    const raw = [
      "From: Bank Alerts <alerts@mybank.com>",
      "To: bank@philliplogan.com",
      "Subject: Transaction Alert",
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="BOUND"',
      "",
      "--BOUND",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Your account was debited JMD 4,512.35 at HI-LO=20PORTMORE on 02-Jul-2026.",
      "",
      "--BOUND--",
      "",
    ].join(CRLF);

    const mime = await parseRawMime(raw);
    expect(mime.from).toBe("alerts@mybank.com");
    expect(mime.subject).toBe("Transaction Alert");
    // Quoted-printable "=20" decoded back to a space; no envelope headers leak.
    expect(mime.text).toContain("debited JMD 4,512.35 at HI-LO PORTMORE");
    expect(mime.text).not.toContain("Content-Transfer-Encoding");
  });

  it("recovers a body from an HTML-only message", async () => {
    const raw = [
      "From: alerts@mybank.com",
      "Subject: Alert",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      "<p>Debited <b>JMD 500.00</b> at SHOP</p>",
      "",
    ].join(CRLF);

    const mime = await parseRawMime(raw);
    expect(mime.from).toBe("alerts@mybank.com");
    expect(mime.html).toContain("JMD 500.00");
    // htmlToText downstream turns this into a clean body.
    expect(htmlToText(mime.html ?? "")).toContain("JMD 500.00");
  });
});
