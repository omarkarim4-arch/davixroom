import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/config/public-env';

/**
 * Supabase client bound to the request's cookies, for server components,
 * route handlers and server actions.
 *
 * Used only for authentication — signing in, signing out, and establishing who
 * the caller is. Application data is read through the repositories over direct
 * SQL, so this client never becomes a second, competing data path.
 */
export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. The middleware refreshes
          // the session on every request, so this is safe to ignore here.
        }
      },
    },
  });
};
