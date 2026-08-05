import { z } from 'zod';

/**
 * Server-side environment validation.
 *
 * Parsed once at boot so a missing or malformed variable fails immediately with
 * a readable message, rather than surfacing as an undefined value deep inside a
 * request weeks later.
 *
 * Variables become required as the stage that needs them lands, so this schema
 * doubles as the checklist of what the running system actually depends on.
 * Never import this module from client components — see `public-env.ts`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Public origin, used for absolute links in invitations and notifications. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Stage 3 — Supabase project. The URL and publishable key are public by
  // design and safe to ship to the browser.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),

  /**
   * Direct Postgres connection, used by the repositories.
   *
   * A secret. It must connect as a role without BYPASSRLS, because the whole
   * tenancy boundary rests on row level security applying to this connection.
   */
  DATABASE_URL: z.string().min(1),

  // Stage 7 — live sessions
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),

  // Stage 9 — AI summaries
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Accepts a plain record rather than `NodeJS.ProcessEnv` so tests can pass a
 * partial environment without fighting the ambient type.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export const parseEnv = (source: EnvSource): Env => {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    // Names only. Values are never included — DATABASE_URL is a secret, and an
    // error message is the easiest way for one to reach a log aggregator.
    const detail = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  return result.data;
};

let cached: Env | null = null;

/** Lazily parsed singleton, so importing this module never throws at import time. */
export const env = (): Env => {
  cached ??= parseEnv(process.env);
  return cached;
};

/** Test helper: clears the memoised value so a new environment can be parsed. */
export const resetEnvCache = (): void => {
  cached = null;
};
