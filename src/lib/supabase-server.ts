import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

/**
 * Creates a Supabase client authenticated as the current user.
 * Uses the anon key + user's JWT so RLS policies are enforced.
 */
export function createServerClient() {
  let token: string | undefined;
  try {
    const cookieStore = cookies();
    token = cookieStore.get('sb-access-token')?.value;
  } catch {
    // cookies() throws outside of request context (e.g. during build)
  }

  if (token) {
    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  // No user token — return unauthenticated anon client (RLS returns zero rows).
  // NEVER fall back to service_role here; that would bypass all tenant isolation.
  return createClient(url, anonKey);
}

/**
 * Creates a Supabase client with service_role key (bypasses RLS).
 * Use ONLY for: portal routes, webhooks, admin operations.
 */
export function createAdminClient() {
  return createClient(url, serviceKey);
}
