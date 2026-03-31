"use client";

import Link from "next/link";

export default function StartHere() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <header className="mb-10 md:mb-14 border-b border-outline-variant/20 pb-8 md:pb-12">
        <span className="text-secondary font-label font-bold tracking-widest text-xs uppercase mb-4 block">Welcome</span>
        <h1 className="font-headline text-3xl md:text-5xl lg:text-6xl font-bold text-primary tracking-tight leading-none mb-4 md:mb-6">
          Start Here
        </h1>
        <p className="text-on-surface-variant text-lg leading-relaxed font-body">
          Everything you need to know about Civic Ledger in two minutes.
        </p>
      </header>

      <div className="space-y-10 text-on-surface leading-relaxed">
        <section>
          <h2 className="font-headline text-2xl font-bold text-primary mb-3">What is Civic Ledger?</h2>
          <p>
            This site tracks what Transylvania County commissioners discuss, vote on, promise, and spend.
            Every piece of data comes from official public meeting minutes and the county&apos;s published budget documents.
            The goal is simple: make it easy for residents to see what their local government is doing without having to attend every meeting.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-2xl font-bold text-primary mb-3">Who runs this?</h2>
          <p>
            Civic Ledger is an independent volunteer project. It is not affiliated with the county government,
            any political party, or any candidate. The site presents facts from public records — no editorializing,
            no political scorecards, no partisan framing.
          </p>
        </section>

        <section>
          <h2 className="font-headline text-2xl font-bold text-primary mb-3">Where does the data come from?</h2>
          <p>
            Meeting data is extracted from the county&apos;s official published minutes using AI-assisted processing,
            then reviewed by volunteers for accuracy. Budget data comes from the county&apos;s FY2025-2026 Recommended
            Budget document. We link to the original source documents wherever possible so you can verify anything yourself.
          </p>
          <p className="mt-2">
            <Link href="/methodology" className="text-primary font-bold hover:underline">
              Read our full methodology →
            </Link>
          </p>
        </section>

        <section>
          <h2 className="font-headline text-2xl font-bold text-primary mb-4">Where should I start?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/budget" className="bg-surface-container-low p-5 rounded-lg hover:bg-surface-container-high transition-colors group">
              <span className="material-symbols-outlined text-secondary text-2xl mb-2 block">account_balance</span>
              <h3 className="font-headline text-lg font-bold text-primary group-hover:underline mb-1">Curious about your taxes?</h3>
              <p className="text-sm text-on-surface-variant">See where the county&apos;s $81 million budget goes, department by department.</p>
            </Link>
            <Link href="/follow-ups" className="bg-surface-container-low p-5 rounded-lg hover:bg-surface-container-high transition-colors group">
              <span className="material-symbols-outlined text-secondary text-2xl mb-2 block">pending_actions</span>
              <h3 className="font-headline text-lg font-bold text-primary group-hover:underline mb-1">Holding them accountable?</h3>
              <p className="text-sm text-on-surface-variant">See promises commissioners made in meetings and whether they followed through.</p>
            </Link>
            <Link href="/meetings" className="bg-surface-container-low p-5 rounded-lg hover:bg-surface-container-high transition-colors group">
              <span className="material-symbols-outlined text-secondary text-2xl mb-2 block">event</span>
              <h3 className="font-headline text-lg font-bold text-primary group-hover:underline mb-1">What happened last meeting?</h3>
              <p className="text-sm text-on-surface-variant">Browse meeting summaries with votes, topics, and public comments.</p>
            </Link>
          </div>
        </section>

        <section className="bg-surface-container-low rounded-lg p-6 md:p-8">
          <h2 className="font-headline text-2xl font-bold text-primary mb-3">Stay updated</h2>
          <p className="mb-4">
            Don&apos;t want to check the site every week? Subscribe to get notified when new meeting data is available —
            a quick summary of what happened, delivered to your inbox.
          </p>
          <p className="text-sm text-on-surface-variant">
            Use the subscribe form in the footer below, or just bookmark this site and check back after each commissioner meeting
            (typically the 2nd and 4th Monday of each month).
          </p>
        </section>
      </div>
    </div>
  );
}
