"use client";

import Link from "next/link";

export default function MeetingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Meeting page error:", error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h2 className="font-headline text-2xl text-primary mb-2">
          Could not load this meeting
        </h2>
        <p className="text-secondary text-sm mb-6">
          There was a problem loading the meeting data. The meeting may not
          exist or there was a temporary error.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-label hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/meetings"
            className="px-4 py-2 border border-primary/20 text-primary rounded-md text-sm font-label hover:bg-primary/5 transition-colors"
          >
            All meetings
          </Link>
        </div>
      </div>
    </div>
  );
}
