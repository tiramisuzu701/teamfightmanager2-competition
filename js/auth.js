import { supabase } from "./supabaseClient.js";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// Call at the top of any admin-only page. Redirects to login.html if there
// is no active session, and returns the session otherwise.
export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `login.html?next=${next}`;
    return null;
  }
  return session;
}
