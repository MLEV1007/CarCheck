import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase kliens Server Component-ekhez, Server Action-ökhöz és Route Handler-ekhez.
 *
 * FONTOS: Server Component-ből nem lehet cookie-t írni, ezért a `setAll` hívás
 * ott elbukik -- ezt szándékosan nyeljük el (try/catch), mert a munkamenet
 * frissítését úgyis a middleware.ts végzi el minden requesten.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component-ből hívva -- lásd a fenti megjegyzést.
          }
        },
      },
    }
  );
}
