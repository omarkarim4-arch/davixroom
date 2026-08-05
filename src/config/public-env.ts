/**
 * The subset of configuration that is safe in a browser bundle.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when it is
 * written as a literal member expression, so these cannot be read through a
 * dynamic lookup or a shared schema object. That is why this file duplicates
 * two names instead of importing from `env.ts` — importing the server schema
 * into a client component would also drag `DATABASE_URL` into the bundle.
 *
 * Both values here are public by design: the publishable key identifies the
 * project and carries no privileges beyond what row level security allows.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const publicEnv = {
  supabaseUrl: url ?? '',
  supabasePublishableKey: publishableKey ?? '',
} as const;

export const assertPublicEnv = (): void => {
  if (publicEnv.supabaseUrl === '' || publicEnv.supabasePublishableKey === '') {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
        'Copy .env.example to .env.local and fill it in.',
    );
  }
};
