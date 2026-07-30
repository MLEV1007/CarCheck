import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase kliens Client Component-ekhez (böngészőben fut).
 * Minden renderkor új példányt ad vissza, de a supabase-js belső
 * connection poolja miatt ez nem probléma.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
