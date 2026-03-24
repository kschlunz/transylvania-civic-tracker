"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const adminId = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
        setIsAdmin(!adminId || session.user.id === adminId);
      }
      setIsLoading(false);
    });
  }, []);

  return { isAdmin, isLoading };
}
