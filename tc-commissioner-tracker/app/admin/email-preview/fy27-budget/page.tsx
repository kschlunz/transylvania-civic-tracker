"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface PreviewData {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export default function Fy27BudgetEmailPreview() {
  const { isAdmin, isLoading } = useIsAdmin();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!isAdmin || isLoading) return;
    const adminId = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
    if (!adminId) {
      setError("NEXT_PUBLIC_ADMIN_USER_ID is not configured.");
      return;
    }
    setFetching(true);
    fetch("/api/send-budget-email", {
      method: "GET",
      headers: { "x-admin-user-id": adminId },
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        setPreview(json as PreviewData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setFetching(false));
  }, [isAdmin, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-error mb-4 block">lock</span>
          <h1 className="font-headline text-3xl text-primary font-bold mb-2">Unauthorized</h1>
          <p className="text-on-surface-variant mb-6">Sign in as the admin to preview emails.</p>
          <Link href="/admin/login" className="text-primary font-bold text-sm underline">
            Go to admin login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-screen-lg mx-auto px-4 md:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/admin/intake"
            className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Admin
          </Link>
        </div>

        <h1 className="font-headline text-3xl text-primary font-bold mb-1">FY27 Budget Email — Preview</h1>
        <p className="text-sm text-on-surface-variant mb-6">
          This is a preview only — sending is not triggered from this page. Use the CLI script to
          test-send or send for real.
        </p>

        <div className="bg-secondary-fixed border-l-4 border-secondary rounded-r-lg p-4 mb-8 text-sm text-on-surface">
          <p className="font-bold mb-1">Before sending</p>
          <ol className="list-decimal pl-5 space-y-1 text-on-surface-variant">
            <li>Confirm the subject, intro paragraphs, and chart rows look right below.</li>
            <li>
              Run <code className="font-mono text-xs bg-surface px-1 py-0.5 rounded">npx tsx scripts/send-budget-email.ts</code> for a dry-run (no email leaves your machine).
            </li>
            <li>
              Run <code className="font-mono text-xs bg-surface px-1 py-0.5 rounded">npx tsx scripts/send-budget-email.ts --test=you@example.com</code> and open in Gmail web, Gmail mobile, Outlook web, and Apple Mail with images <em>off</em>.
            </li>
            <li>
              Only then: <code className="font-mono text-xs bg-surface px-1 py-0.5 rounded">npx tsx scripts/send-budget-email.ts --send --confirm</code>.
            </li>
          </ol>
        </div>

        {fetching && (
          <div className="text-sm text-on-surface-variant">Loading preview…</div>
        )}

        {error && (
          <div className="bg-error-container/30 border border-error/40 rounded-lg p-4 text-sm text-on-surface mb-6">
            <p className="font-bold mb-1">Preview failed</p>
            <p className="text-on-surface-variant whitespace-pre-wrap">{error}</p>
            <p className="text-xs text-on-surface-variant mt-3">
              Most common cause: budget migrations haven&apos;t been applied yet. Paste{" "}
              <code>supabase/migrations/20260528_budget_breakdowns.sql</code> into the Supabase SQL
              editor.
            </p>
          </div>
        )}

        {preview && (
          <div className="space-y-6">
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5">
              <div className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                Subject
              </div>
              <p className="font-headline text-lg text-primary mb-4">{preview.subject}</p>
              <div className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                Preheader
              </div>
              <p className="text-sm text-on-surface italic">{preview.preheader}</p>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden">
              <div className="bg-surface-container px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between">
                <div className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant">
                  Rendered HTML (iframe)
                </div>
                <div className="text-[10px] text-on-surface-variant/70">
                  ~600px wide · email client view
                </div>
              </div>
              <iframe
                title="FY27 Budget Email Preview"
                srcDoc={preview.html}
                sandbox=""
                style={{ width: "100%", height: "1100px", border: "none", backgroundColor: "#F5F2ED" }}
              />
            </div>

            <details className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5">
              <summary className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant cursor-pointer">
                Plain-text alternative body
              </summary>
              <pre className="mt-4 text-xs text-on-surface font-mono whitespace-pre-wrap leading-relaxed">
                {preview.text}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
