import { describe, expect, it } from 'vitest';
import { parseEnv, type EnvSource } from './env';

/** A minimal environment that satisfies every required variable. */
const validEnv: EnvSource = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  DATABASE_URL: 'postgresql://user:pass@host:5432/postgres',
};

describe('parseEnv', () => {
  it('applies defaults for the optional variables', () => {
    const env = parseEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.LIVEKIT_URL).toBeUndefined();
  });

  it('rejects a configuration missing the database connection', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a configuration missing the Supabase project', () => {
    expect(() =>
      parseEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: undefined }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('rejects a malformed URL rather than deferring the failure', () => {
    expect(() => parseEnv({ ...validEnv, APP_URL: 'not-a-url' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('never includes a value in the error message', () => {
    // The message reaches logs. A connection string carries the database
    // password, so only names may appear.
    const secret = 'postgresql://user:sup3rs3cr3t@host:5432/postgres';

    try {
      parseEnv({ ...validEnv, DATABASE_URL: secret, APP_URL: 'not-a-url' });
      throw new Error('expected parseEnv to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('sup3rs3cr3t');
      expect(message).not.toContain(secret);
      expect(message).toContain('APP_URL');
    }
  });

  it('accepts a fully configured environment', () => {
    const env = parseEnv({
      ...validEnv,
      NODE_ENV: 'production',
      APP_URL: 'https://app.davixroom.com',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });
});
