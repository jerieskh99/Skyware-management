import { describe, it, expect } from "vitest";
import { renderTitle } from "@/lib/recurring/schedule";

const TZ = "Asia/Jerusalem";

describe("renderTitle", () => {
  it("returns the template unchanged when no placeholders are present", () => {
    const out = renderTitle("Weekly server health check", new Date("2026-05-24T08:00:00Z"), TZ);
    expect(out).toBe("Weekly server health check");
  });

  it("substitutes {{date}} with yyyy-MM-dd in the template timezone", () => {
    // 2026-05-24 22:00 UTC = 2026-05-25 01:00 Asia/Jerusalem.
    const out = renderTitle("Backup report {{date}}", new Date("2026-05-24T22:00:00Z"), TZ);
    expect(out).toBe("Backup report 2026-05-25");
  });

  it("substitutes {{month}} with yyyy-MM", () => {
    const out = renderTitle("Monthly billing {{month}}", new Date("2026-05-15T10:00:00Z"), TZ);
    expect(out).toBe("Monthly billing 2026-05");
  });

  it("substitutes {{week}} with ISO yyyy-Www", () => {
    // 2026-05-24 is ISO week 21.
    const out = renderTitle("Status update {{week}}", new Date("2026-05-24T10:00:00Z"), TZ);
    expect(out).toBe("Status update 2026-W21");
  });

  it("replaces all occurrences of the same placeholder", () => {
    const out = renderTitle("{{date}} part A / {{date}} part B", new Date("2026-05-24T10:00:00Z"), TZ);
    expect(out).toBe("2026-05-24 part A / 2026-05-24 part B");
  });
});
