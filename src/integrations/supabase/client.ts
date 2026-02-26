// src/integrations/supabase/client.ts
import type { Database } from "@/types/database";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL) {
  throw new Error("Missing VITE_SUPABASE_URL in .env");
}

if (!SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_ANON_KEY in .env");
}

// Optional sanity check (helps catch bad copy/paste)
if (!SUPABASE_URL.includes(".supabase.co")) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL does not look like a Supabase project URL:",
    SUPABASE_URL
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,

    // ✅ Better for SPA auth flows (especially magic-link/confirm links)
    flowType: "pkce",

    // ✅ Explicit storage (helps in some mobile webview cases)
    storage: window?.localStorage,
  },
});

// DevTools helpers (optional)
if (import.meta.env.DEV) {
  (window as any).supabase = supabase;
  (window as any).SUPABASE_URL = SUPABASE_URL;
}