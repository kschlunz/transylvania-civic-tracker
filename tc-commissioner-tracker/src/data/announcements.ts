export interface Announcement {
  date: string;
  text: string;
  link?: string;
  icon?: string;
}

export const announcements: Announcement[] = [
  { date: "2026-03-30", text: "Budget Explorer launched with full FY26 county budget data", link: "/budget", icon: "rocket_launch" },
  { date: "2026-03-31", text: "Added plain-English context to top budget changes across all departments", link: "/budget", icon: "lightbulb" },
];
