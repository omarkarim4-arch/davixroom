import { config } from 'dotenv';

/**
 * Loads .env.local so tests that talk to the live database can find
 * DATABASE_URL. Absent in CI and on fresh checkouts, which is fine — the tests
 * that need it skip themselves rather than fail.
 *
 * `quiet` suppresses dotenv's summary line, which would otherwise print the
 * names of loaded variables into test output.
 */
config({ path: '.env.local', quiet: true });
