/**
 * TEST ENVIRONMENT SETUP
 * Loads FIS_TEST_DATABASE_URL from backend/.env and points DATABASE_URL
 * at the DEDICATED test database BEFORE any application module is imported.
 * Rate limits are raised so tests don't hit throttling.
 */
import 'dotenv/config';

const testDatabaseUrl = process.env['FIS_TEST_DATABASE_URL'];

if (!testDatabaseUrl) {
  throw new Error(
    'FIS_TEST_DATABASE_URL is required for tests. ' +
      'Set it in backend/.env (see backend/.env.example). Tests never run against the app database.',
  );
}

process.env['DATABASE_URL'] = testDatabaseUrl;
process.env['NODE_ENV'] = 'test';
process.env['RATE_LIMIT_WINDOW_MS'] = '60000';
process.env['RATE_LIMIT_MAX'] = '100000';
process.env['AUTH_RATE_LIMIT_MAX'] = '100000';
process.env['COOKIE_SECURE'] = 'false';
process.env['COOKIE_SAME_SITE'] = 'lax';
process.env['SESSION_EXPIRES_DAYS'] = '7';
process.env['REQUEST_BODY_LIMIT'] = '100kb';
process.env['CORS_ORIGIN'] = 'http://localhost:5173';
