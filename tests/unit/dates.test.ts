import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { localDate, localInputsToISO, localTime } from "@/lib/dates";

// The production server runs with TZ=America/Jamaica (UTC−5, no DST); pin it
// here so these tests don't depend on the machine running them.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Jamaica";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe("local date helpers", () => {
  it("sends form inputs as the instant the user meant", () => {
    // 5:46 pm in Kingston is 22:46 UTC — not 17:46 UTC, which was the bug.
    expect(localInputsToISO("2026-10-04", "17:46")).toBe("2026-10-04T22:46:00.000Z");
  });

  it("round-trips through the form without drifting", () => {
    const stored = "2026-10-04T22:46:00.000Z";
    expect(localInputsToISO(localDate(stored), localTime(stored))).toBe(stored);
  });

  it("dates an evening transaction on its local day, not the UTC one", () => {
    // 8:10 pm Fri 2 Oct in Kingston is already 3 Oct in UTC.
    expect(localDate("2026-10-03T01:10:00.000Z")).toBe("2026-10-02");
    expect(localTime("2026-10-03T01:10:00.000Z")).toBe("20:10");
  });
});
