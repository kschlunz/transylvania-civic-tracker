"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!supabase) {
      setError("Supabase not configured.");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/admin/intake");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-headline text-3xl text-primary font-bold mb-2 text-center">
          Admin Login
        </h1>
        <p className="text-on-surface-variant text-sm text-center mb-8">
          Civic Ledger data management
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary block mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded px-4 py-2.5 text-sm font-body focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
            />
          </div>
          <div>
            <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary block mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded px-4 py-2.5 text-sm font-body focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
            />
          </div>

          {error && (
            <div className="bg-error-container text-on-error-container px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary px-6 py-3 rounded font-label text-sm font-bold hover:bg-primary-container transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
