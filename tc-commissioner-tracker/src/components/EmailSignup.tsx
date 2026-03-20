"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function EmailSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("saving");

    if (supabase) {
      const { error } = await supabase
        .from("subscribers")
        .insert({ email: email.trim().toLowerCase() });

      if (error) {
        if (error.code === "23505") {
          setStatus("success");
          setMessage("You're already subscribed.");
        } else {
          setStatus("error");
          setMessage("Something went wrong. Please try again.");
        }
        return;
      }
    }

    setStatus("success");
    setMessage("Subscribed! We'll notify you when new meeting data is available.");
    setEmail("");
  }

  if (status === "success") {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary">
        <span className="material-symbols-outlined text-lg">check_circle</span>
        <span className="font-label font-bold">{message}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-2.5 text-sm font-body focus:ring-1 focus:ring-primary focus:border-primary outline-none w-full max-w-xs"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="bg-primary text-on-primary px-5 py-2.5 rounded-lg text-sm font-label font-bold hover:bg-primary-container transition-colors shrink-0 disabled:opacity-50"
      >
        {status === "saving" ? "..." : "Subscribe"}
      </button>
      {status === "error" && (
        <span className="text-xs text-error">{message}</span>
      )}
    </form>
  );
}
