import {
  DOCUMENT_STATUS_LABELS,
  type BudgetDocument,
  type BudgetDocumentStatus,
} from "@/lib/budget-cycle-types";

const STATUS_CLASSES: Record<BudgetDocumentStatus, string> = {
  planning: "bg-surface-container-high text-on-surface-variant border-outline-variant/40",
  recommended: "bg-blue-50 text-blue-900 border-blue-200",
  under_revision: "bg-amber-50 text-amber-900 border-amber-200",
  adopted: "bg-primary text-on-primary border-primary",
  superseded: "bg-surface-container-low text-on-surface-variant/60 border-outline-variant/30 line-through",
};

function formatPresentedDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "official source";
  }
}

interface BudgetDocumentListProps {
  documents: BudgetDocument[];
}

export default function BudgetDocumentList({ documents }: BudgetDocumentListProps) {
  if (documents.length === 0) {
    return (
      <p className="text-on-surface-variant text-sm italic">
        No budget documents have been published yet for this cycle.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map((doc) => {
        const statusClass = STATUS_CLASSES[doc.docStatus];
        return (
          <article
            key={doc.id}
            className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5 md:p-6"
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
              <h3 className="font-headline text-xl md:text-2xl text-primary">{doc.title}</h3>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border w-fit ${statusClass}`}
              >
                {DOCUMENT_STATUS_LABELS[doc.docStatus]}
              </span>
            </div>

            {doc.presentedDate && (
              <p className="text-[11px] font-label font-bold uppercase tracking-widest text-secondary mb-3">
                Presented {formatPresentedDate(doc.presentedDate)}
              </p>
            )}

            {doc.plainSummary && (
              <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
                {doc.plainSummary}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs">
              {doc.sourceUrl ? (
                <>
                  <a
                    href={doc.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-label font-bold uppercase tracking-wider text-primary hover:opacity-70 transition-opacity"
                  >
                    View document
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </a>
                  <span className="text-on-surface-variant/70">
                    Source: {sourceHost(doc.sourceUrl)}
                  </span>
                </>
              ) : (
                <span className="text-on-surface-variant/60 italic">
                  Document link coming soon
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
