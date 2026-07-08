import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (SUPABASE_URL.includes("YOUR_SUPABASE") || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) {
  // Not fatal - lets the page still render so the user can see the
  // "not configured yet" banner instead of a blank white screen.
  console.warn(
    "Supabase is not configured yet. Edit js/config.js with your project URL and anon key (see SETUP.md)."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function isConfigured() {
  return !SUPABASE_URL.includes("YOUR_SUPABASE") && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
}
