import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = parseEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.SUPABASE_URL).toBeUndefined();
  });

  it('rejects a malformed URL rather than deferring the failure', () => {
    expect(() => parseEnv({ APP_URL: 'not-a-url' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('names the offending variable in the error', () => {
    expect(() => parseEnv({ SUPABASE_URL: 'nope' })).toThrow(/SUPABASE_URL/);
  });

  it('accepts a fully configured environment', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://app.davixroom.com',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.SUPABASE_ANON_KEY).toBe('anon');
  });
});
