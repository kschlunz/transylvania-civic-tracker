interface BudgetExplainerProps {
  /** Optional href for the FY27 Recommended Budget Book link in the disclaimer. */
  sourceUrl?: string | null;
}

export default function BudgetExplainer({ sourceUrl }: BudgetExplainerProps) {
  const sourceLink = sourceUrl ? (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-primary/40 hover:decoration-primary"
    >
      FY27 Recommended Budget Book
    </a>
  ) : (
    <a
      href="#documents"
      className="underline decoration-primary/40 hover:decoration-primary"
    >
      FY27 Recommended Budget Book
    </a>
  );

  return (
    <section className="border-l-4 border-primary/30 pl-5 md:pl-6">
      <h2 className="font-headline text-3xl text-primary mb-6">Understanding this budget</h2>

      <h3 className="font-headline text-xl text-primary mt-2 mb-3">
        &ldquo;No tax increase&rdquo; &mdash; what it means
      </h3>
      <p className="text-on-surface text-base leading-relaxed mb-5 max-w-2xl">
        The recommended budget keeps the property tax rate at <strong>$0.4105 per $100</strong> of
        assessed value &mdash; the same as last year. That&apos;s what &ldquo;no tax increase&rdquo;
        refers to: no change to the rate.
      </p>

      <details className="group">
        <summary className="list-none cursor-pointer inline-flex items-center gap-2 text-xs font-label font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity mb-6 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Read the full explainer</span>
          <span className="hidden group-open:inline">Hide the full explainer</span>
          <span className="material-symbols-outlined text-sm transition-transform group-open:rotate-180">
            expand_more
          </span>
        </summary>

        <div className="space-y-5 max-w-2xl">
          <p className="text-on-surface text-base leading-relaxed">
            A flat rate isn&apos;t the same as a flat bill. Even with no rate change, projected
            property tax revenue rises about <strong>$900,000</strong> (roughly $46.3M to $47.3M)
            because the tax base grows &mdash; new construction and rising property values add to
            the total being taxed. So an individual bill can still go up if that property&apos;s
            assessed value rose.
          </p>

          <h3 className="font-headline text-xl text-primary mt-6 mb-3">
            How does a 1.47% increase work against inflation?
          </h3>
          <p className="text-on-surface text-base leading-relaxed">
            The total budget is <strong>$82,536,220</strong>, up <strong>1.47%</strong> over last
            year &mdash; tight, given the budget cites a 3.8% CPI increase. It stays lean through
            three choices the budget states directly:
          </p>
          <ul className="list-disc pl-6 text-on-surface text-base leading-relaxed space-y-3">
            <li>
              <strong>Holding personnel costs down.</strong> Minimal staffing changes. The budget
              calls the county pay plan &ldquo;out of date for the region&rdquo; and notes a
              market-rate adjustment &ldquo;would likely require an increase in funding&rdquo;
              &mdash; so that fix is largely deferred. The one big personnel cost absorbed is an
              <strong> 8% health insurance increase</strong>.
            </li>
            <li>
              <strong>Capital funded in advance.</strong> The new courthouse and school bond
              projects aren&apos;t driving this year&apos;s increase. Their financing was planned
              years ahead, with dedicated tax revenue set aside since FY25 to smooth larger
              payments coming in FY28&ndash;FY32.
            </li>
            <li>
              <strong>Partners funded at or below inflation.</strong> Schools, Blue Ridge Community
              College, and the Economic Alliance get a 2% operational increase &mdash; below
              inflation, and below the 7% schools received last year.
            </li>
          </ul>

          <h3 className="font-headline text-xl text-primary mt-6 mb-3">
            What&apos;s deferred or flagged as a risk
          </h3>
          <p className="text-on-surface text-base leading-relaxed">
            The budget&apos;s own &ldquo;Trends &amp; Risks&rdquo; section names pressures left for
            future years:
          </p>
          <ul className="list-disc pl-6 text-on-surface text-base leading-relaxed space-y-3">
            <li>
              <strong>SNAP and Medicaid:</strong> if the state passes these costs to counties, an
              estimated <strong>$1.2 million per year</strong> in new mandatory expense &mdash;
              more than the entire 1.47% increase.
            </li>
            <li>
              <strong>Teacher pay:</strong> if the state raises base salaries, roughly{" "}
              <strong>$1 million per year</strong> in added county cost.
            </li>
            <li>
              The budget notes these two together &ldquo;equal 2 cents in the county budget.&rdquo;
            </li>
            <li>
              Also named as deferred or unfunded: the pay-plan update, future courthouse operating
              costs, long-term solid waste capital, and a requested <strong>$68 million</strong>{" "}
              BRCC campus.
            </li>
          </ul>

          <h3 className="font-headline text-xl text-primary mt-6 mb-3">The bottom line</h3>
          <p className="text-on-surface text-base leading-relaxed">
            The budget holds the rate flat and the increase to 1.47% &mdash; a lean number &mdash;
            largely by deferring a needed pay-plan update, funding partners below inflation, and
            relying on capital financed in earlier years. The budget is direct that this pushes
            large decisions into future years, and that state choices on SNAP, Medicaid, and
            teacher pay could add over <strong>$2 million</strong> in costs the county would
            absorb mid-year, with no local control.
          </p>

          <h3 className="font-headline text-xl text-primary mt-6 mb-3">Have a say</h3>
          <p className="text-on-surface text-base leading-relaxed">
            The Board of Commissioners holds a public hearing on <strong>June 22, 2026 at 6 PM</strong>{" "}
            at the Multipurpose Chambers, 101 S. Broad St., Brevard, and is scheduled to vote on
            adoption the same evening. Two commissioner seats are on the ballot in November 2026.
          </p>
        </div>
      </details>

      <p className="mt-8 text-xs font-label text-on-surface-variant/80 italic leading-relaxed">
        Every figure is drawn from the {sourceLink}. Civic Ledger is a non-partisan volunteer
        project and takes no position on the budget.
      </p>
    </section>
  );
}
