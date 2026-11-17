import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inferMeetingType, parseMeetingsPage } from "../county";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("county meetings page", () => {
  it("parses the current page with real links", () => {
    const rows = parseMeetingsPage(fixture("meetings-page-0.html"));
    expect(rows).toHaveLength(25);
    expect(rows.find((r) => r.date === "2026-02-09")).toEqual({
      date: "2026-02-09",
      title: "Commissioners' Meeting 02/09/26",
      type: "regular",
      time: "4:00 PM",
      pageUrl: "https://www.transylvaniacounty.org/meetings/commissioners-meeting-020926",
      agendaUrl: "https://www.transylvaniacounty.org/sites/default/files/departments/administration/agendas/2026-02-09%20BOC%20Agenda.pdf",
      minutesUrl: "https://www.transylvaniacounty.org/sites/default/files/departments/administration/minutes/2026-02-09%20reg%20mtg.pdf",
      videoUrl: "https://vimeo.com/event/5710563",
    });
  });

  it("takes dates from the page, not from file names", () => {
    const rows = parseMeetingsPage(fixture("meetings-page-0.html"));
    // The county's agenda file for this meeting is misnamed "2024-08-24".
    expect(rows.find((r) => r.agendaUrl?.includes("2024-08-24"))?.date).toBe("2026-08-24");
    expect(rows.find((r) => r.title === "Board of Commissioners - Budget Workshop")).toMatchObject({ date: "2026-06-02", type: "workshop" });
  });

  it("keeps irregular minutes links and notes when minutes are not posted", () => {
    const rows = parseMeetingsPage(fixture("meetings-page-0.html"));
    expect(rows.find((r) => r.date === "2025-06-23")?.minutesUrl).toMatch(/2025-06-23%20reg%20mtg%20%26%20PH%20%282%29\.pdf$/);
    expect(rows.find((r) => r.date === "2026-10-26")?.minutesUrl).toBeUndefined();
  });

  it("parses older pages and maps meeting types to the site's three", () => {
    const rows = parseMeetingsPage(fixture("meetings-page-12.html"));
    expect(rows).toHaveLength(25);
    expect(rows.find((r) => r.date === "2014-06-25")?.type).toBe("special");
    expect(inferMeetingType("OATH OF OFFICE CEREMONY, ORGANIZATIONAL MEETING OF THE BOARD")).toBe("special");
    expect(inferMeetingType("FY 2026 Budget Workshop 2 06/17/25")).toBe("workshop");
    expect(parseMeetingsPage("<html>Maintenance</html>")).toEqual([]);
  });
});
