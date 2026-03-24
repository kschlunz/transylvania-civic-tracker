import Link from "next/link";

const CATEGORY_DETAILS = [
  {
    id: "fiscal",
    icon: "account_balance_wallet",
    label: "Fiscal Policy & Revenue",
    description: "County budget decisions, tax rates, revenue sources, and financial planning. Includes property tax discussions, sales tax referendums, fee structures, debt management, and grant funding.",
    examples: ["FY27 budget strategy with no tax increase", "Quarter-cent sales tax referendum timing", "Federal PILT funding advocacy", "$7M landfill grant savings"],
  },
  {
    id: "schools",
    icon: "school",
    label: "Schools & Capital",
    description: "Public school facilities, capital improvement projects for education, and coordination between the county and school system on building needs.",
    examples: ["NCDPI review timelines for school capital projects", "Rosman old gym structural issues", "Virtual instructional day waivers for WNC schools"],
  },
  {
    id: "safety",
    icon: "shield",
    label: "Public Safety",
    description: "Law enforcement, fire services, EMS, 911 operations, emergency preparedness, and cybersecurity. Includes staffing, equipment, and facility needs for public safety agencies.",
    examples: ["SecureNC cybersecurity pilot MOU", "911 Center full staffing achievement", "Satellite Fire/EMS facility advocacy", "Quebec EMS station"],
  },
  {
    id: "infrastructure",
    icon: "construction",
    label: "Infrastructure",
    description: "County buildings, roads, bridges, water/sewer systems, technology upgrades, and capital construction projects. Includes maintenance, renovation, and new construction.",
    examples: ["Courthouse expansion estimates (~$36M)", "AV system upgrade for chambers ($183K)", "Capital project reporting improvements", "BRCC campus projects"],
  },
  {
    id: "econ",
    icon: "trending_up",
    label: "Economic Development",
    description: "Business recruitment, workforce development, tourism, and economic growth initiatives. Includes incentive programs and partnership with economic development organizations.",
    examples: ["Business park development", "Workforce training programs", "Tourism marketing initiatives"],
  },
  {
    id: "governance",
    icon: "visibility",
    label: "Transparency & Governance",
    description: "Government processes, public accountability, meeting procedures, advisory board operations, open records, and inter-governmental relations. Includes NCACC activities and legislative advocacy.",
    examples: ["Nonprofit grant SMART goals for outcome tracking", "Advisory board minutes posted online", "Social media misinformation clarification", "County Planner vacancy hiring"],
  },
  {
    id: "environment",
    icon: "eco",
    label: "Environment & Land",
    description: "Land conservation, solid waste management, water quality, parks and recreation, and natural resource stewardship. Includes the county's significant public land holdings.",
    examples: ["Solid waste rate study", "Parcel fee model for solid waste", "Landfill operations and grants", "PILT funding for county land"],
  },
  {
    id: "housing",
    icon: "home",
    label: "Housing",
    description: "Affordable housing, workforce housing, zoning for residential development, mobile home valuation, and implementation of the county Housing Plan.",
    examples: ["County Planner hire to implement Housing Plan", "Differentiated tax rate on vacation/second homes", "Mobile home valuation fairness"],
  },
  {
    id: "health",
    icon: "favorite",
    label: "Health & Human Services",
    description: "Public health programs, mental health services, social services, senior services, and community wellness initiatives administered or funded by the county.",
    examples: ["DSS program updates", "Senior center operations", "Public health department initiatives"],
  },
  {
    id: "recovery",
    icon: "cyclone",
    label: "Helene Recovery",
    description: "Response, recovery, and rebuilding efforts related to Hurricane Helene's impact on Transylvania County and western North Carolina. Includes FEMA coordination, infrastructure repair, and community resilience.",
    examples: ["Bookmobile generator funding for emergency connectivity", "Starlink for bookmobile emergency use", "'Rising Above Helene' documentary screening"],
  },
  {
    id: "community",
    icon: "diversity_3",
    label: "Community & Culture",
    description: "Cultural events, community organizations, historical preservation, recognition ceremonies, and quality-of-life programs that build community identity and engagement.",
    examples: ["Veterans History Museum promotion", "Black History Month remarks", "Clerk Trisha Hogan's Master Municipal Clerk recognition", "Bookmobile service and programming"],
  },
];

export default function MethodologyPage() {
  return (
    <div className="px-4 md:px-8 lg:px-12 py-8 md:py-16 max-w-screen-2xl mx-auto">
      {/* Header */}
      <header className="mb-12 md:mb-16 max-w-3xl">
        <span className="font-label text-xs uppercase tracking-[0.2em] text-secondary mb-4 block font-bold">Methodology</span>
        <h1 className="font-headline text-3xl md:text-5xl font-bold text-primary mb-6">How We Categorize</h1>
        <p className="font-body text-lg text-on-surface-variant leading-relaxed">
          Every action, vote, and public statement tracked in Civic Ledger is tagged with one or more topic categories.
          This page explains what each category covers, how tagging works, and how to suggest corrections.
        </p>
      </header>

      {/* Process explanation */}
      <section className="mb-16 max-w-3xl">
        <h2 className="font-headline text-2xl font-bold text-primary mb-4">Our Process</h2>
        <div className="space-y-4 text-sm font-body text-on-surface-variant leading-relaxed">
          <p>
            Meeting data is extracted from the{" "}
            <a
              href="https://www.transylvaniacounty.org/meetings"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary hover:text-primary/70"
            >
              official Transylvania County meeting minutes
            </a>{" "}
            published by the county clerk. We use AI-assisted processing (Claude by Anthropic) to identify votes,
            commissioner activity, public comments, and topic categories from the raw minutes text.
          </p>
          <p>
            Every AI-processed meeting is reviewed by a human volunteer before publication. The reviewer verifies
            vote counts, commissioner attributions, and category tags against the source document.
          </p>
          <p>
            Some items naturally span multiple policy areas. A discussion about courthouse renovation costs, for example,
            might be tagged with both <strong>Infrastructure</strong> (the building project) and <strong>Fiscal Policy</strong> (the
            budget implications). We apply multiple tags when the substance of the discussion clearly touches multiple domains.
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className="mb-16">
        <h2 className="font-headline text-2xl font-bold text-primary mb-8">The 11 Topic Categories</h2>
        <div className="space-y-6">
          {CATEGORY_DETAILS.map((cat) => (
            <div
              key={cat.id}
              className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6 md:p-8"
            >
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-2xl text-secondary shrink-0 mt-0.5">{cat.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link
                      href={`/topics/${cat.id}`}
                      className="font-headline text-xl font-bold text-primary hover:underline"
                    >
                      {cat.label}
                    </Link>
                  </div>
                  <p className="font-body text-sm text-on-surface-variant leading-relaxed mb-4">
                    {cat.description}
                  </p>
                  <div>
                    <p className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Examples from meetings</p>
                    <div className="flex flex-wrap gap-2">
                      {cat.examples.map((ex) => (
                        <span
                          key={ex}
                          className="text-[11px] font-label bg-surface-container-low text-on-surface-variant px-2.5 py-1 rounded"
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Corrections */}
      <section className="max-w-3xl mb-16">
        <div className="bg-secondary-fixed/30 border border-secondary/20 rounded-lg p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined text-2xl text-secondary shrink-0">rate_review</span>
            <div>
              <h3 className="font-headline text-xl font-bold text-primary mb-2">Suggest a Correction</h3>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed mb-4">
                If you believe an item has been mistagged, misattributed, or is missing context, we want to hear from you.
                This is a community project and accuracy matters.
              </p>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                Email corrections to{" "}
                <a href="mailto:civicledger@proton.me" className="underline text-primary hover:text-primary/70 font-bold">
                  civicledger@proton.me
                </a>{" "}
                with the meeting date, the specific item, and what you think should be changed. We review all feedback.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
