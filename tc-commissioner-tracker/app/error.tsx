"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Uncaught error:", error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h2 className="font-headline text-2xl text-primary mb-2">
          Something went wrong
        </h2>
        <p className="text-secondary text-sm mb-6">
          An unexpected error occurred. You can try again or head back to the
          home page.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-label hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2 border border-primary/20 text-primary rounded-md text-sm font-label hover:bg-primary/5 transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
