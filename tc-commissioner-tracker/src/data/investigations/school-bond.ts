export interface TimelineEntry {
  date: string;
  title: string;
  description: string;
  sourceUrl?: string;
  sourceMeetingId?: string;
  sourceLabel?: string;
  voteDetail?: string;
  status?: "confirmed" | "gap" | "question";
}

export interface Investigation {
  slug: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  status: "in-progress" | "published";
  summary: string;
  timeline: TimelineEntry[];
  openQuestions: string[];
}

export const schoolBondInvestigation: Investigation = {
  slug: "school-bond",
  title: "The $68 Million Question",
  subtitle:
    "Transylvania County voters approved a $68M school bond in 2018. The bonds weren't sold until 2024. Here's what happened in between — and what it cost.",
  lastUpdated: "2026-03-31",
  status: "in-progress",
  summary:
    "In November 2018, Transylvania County voters approved a $68 million bond referendum for school facility improvements. Six years passed before the bonds were sold in late 2024. This investigation traces the timeline, examines the financial implications of the delay, and asks what oversight existed during the gap period.",

  timeline: [
    {
      date: "2018-11-06",
      title: "Voters approve $68M school bond referendum",
      description:
        "Transylvania County residents vote in favor of a $68 million general obligation bond for school facility repairs, renovations, and improvements across the district. The bond passes with broad community support.",
      sourceLabel: "NC State Board of Elections",
      status: "confirmed",
    },
    {
      date: "2019-01-01",
      title: "2019 — No bond sale",
      description:
        "The first full year after voter approval passes with no bond issuance. Interest rates during this period were historically low, with 10-year municipal bond yields averaging around 2.0-2.5%.",
      status: "gap",
    },
    {
      date: "2020-01-01",
      title: "2020 — Pandemic arrives, still no bond sale",
      description:
        "COVID-19 disrupts county operations. Federal interest rates drop to near zero. Municipal bond rates fall below 1.5% — potentially the most favorable borrowing environment in history. Bonds remain unsold.",
      status: "gap",
    },
    {
      date: "2021-01-01",
      title: "2021 — Rates begin to rise",
      description:
        "The Federal Reserve signals inflation concerns. Municipal bond yields begin climbing from historic lows. The window for ultra-low-cost borrowing begins to close. Bonds still not issued.",
      status: "gap",
    },
    {
      date: "2022-01-01",
      title: "2022 — Rate environment shifts dramatically",
      description:
        "The Federal Reserve begins aggressive rate hikes. Municipal bond yields rise from ~1.5% to ~3.5% over the course of the year. The cost of borrowing $68 million has increased substantially since voter approval.",
      status: "gap",
    },
    {
      date: "2023-01-01",
      title: "2023 — Five years post-approval, no bonds sold",
      description:
        "Half a decade after voters authorized the borrowing, the bonds remain unissued. Municipal rates stabilize around 3.5-4.0% — roughly double what was available in 2020-2021.",
      status: "gap",
    },
    {
      date: "2024-11-01",
      title: "Bonds finally sold — six years after voter approval",
      description:
        "Transylvania County sells the voter-approved school bonds. The interest rate environment has changed dramatically since 2018. The Long Term Leases line in the county budget shows a 878% increase year-over-year, reflecting new debt service obligations.",
      status: "confirmed",
    },
    {
      date: "2025-07-01",
      title: "FY2026 budget reflects bond debt service",
      description:
        "The county's FY2026 recommended budget shows K-12 Public School spending at $15.9 million (+10.0%), with Long Term Leases jumping to $2.3 million — an 878% increase driven by the bond debt payments.",
      sourceLabel: "FY2026 Recommended Budget",
      status: "confirmed",
    },
  ],

  openQuestions: [
    "Why was there a six-year gap between voter approval (2018) and bond sale (2024)? What specific factors caused the delay?",
    "What was the financial impact of the delay? If bonds had been sold in 2020 at ~1.5% vs. 2024 at ~4%, what is the additional interest cost over the life of the bonds?",
    "Were voters informed about the delay and its financial implications? Were there public hearings or progress reports during the 2019-2024 gap period?",
    "What oversight mechanisms existed? Did the Board of Commissioners discuss the bond timeline in public meetings during the gap years?",
    "Are there meeting minutes from 2019-2023 that reference the school bond status? Our backfilled data begins in 2025 — earlier minutes may contain relevant discussions.",
    "What was the original construction timeline presented to voters, and how does the actual timeline compare?",
  ],
};
