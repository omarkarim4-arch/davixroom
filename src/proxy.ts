import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session on every request.
 *
 * Access tokens are short-lived. Without this, a signed-in user's token expires
 * mid-session and server components start seeing them as signed out. The
 * refreshed cookies must be written onto the response that is actually
 * returned, which is why the response object is created first and mutated in
 * place rather than rebuilt afterwards.
 */
export const proxy = async (request: NextRequest): Promise<NextResponse> => {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser rather than getSession: this validates the token with the auth
  // server instead of trusting the cookie's contents.
  await supabase.auth.getUser();

  return response;
};

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files, which never need a
     * session and would otherwise pay for a token refresh each.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
