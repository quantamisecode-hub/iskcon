/**
 * TEST ENVIRONMENT SETUP
 * Loads FIS_TEST_DATABASE_URL from backend/.env and points DATABASE_URL
 * at the DEDICATED test database BEFORE any application module is imported.
 * Rate limits are raised so tests don't hit throttling.
 */
import 'dotenv/config';

process.env['DATABASE_URL'] =
  process.env['FIS_TEST_DATABASE_URL'] ??
  'mysql://food_inventory_user:FisApp_2026!zK9mQ2vX7wR4@localhost:3306/food_inventory_test';
process.env['NODE_ENV'] = 'test';
process.env['RATE_LIMIT_WINDOW_MS'] = '60000';
process.env['RATE_LIMIT_MAX'] = '100000';
process.env['AUTH_RATE_LIMIT_MAX'] = '100000';
process.env['COOKIE_SECURE'] = 'false';
process.env['COOKIE_SAME_SITE'] = 'lax';
process.env['SESSION_EXPIRES_DAYS'] = '7';
process.env['REQUEST_BODY_LIMIT'] = '100kb';
process.env['FRONTEND_URL'] = 'http://localhost:5173';
