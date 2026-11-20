/**
 * cPanel / LiteSpeed entry point.
 * CloudLinux cPanel Node.js selector defaults to app.js.
 */
/* global console, process */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Explicitly load .env from the application directory
dotenv.config({ path: path.join(__dirname, '.env') });

// LiteSpeed (lsnode.js) loads this file via require(), so do NOT use top-level 'await'!
import('./dist/server.js').catch((err) => {
  console.error('Server startup error:', err);
});
