import { z } from 'zod';

/**
 * Environment validation.
 *
 * Parsed once at boot so a missing or malformed variable fails immediately with
 * a readable message, rather than surfacing as an undefined value deep inside a
 * request weeks later.
 *
 * Stage 1 has no infrastructure yet, so every integration variable is optional.
 * As adapters land in later stages their variables become required here — this
 * schema is the checklist of what the running system actually needs.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Public origin, used for absolute links in invitations and notifications. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Stage 2 — persistence
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

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
