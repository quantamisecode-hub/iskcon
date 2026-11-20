/**
 * cPanel / LiteSpeed entry point.
 * CloudLinux cPanel Node.js selector defaults to app.js.
 */
/* global console, process */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Explicitly load .env from the application directory
dotenv.config({ path: path.join(__dirname, '.env') });

try {
  const prismaCli = path.join(__dirname, 'node_modules/prisma/build/index.js');
  if (fs.existsSync(prismaCli)) {
    console.log('Checking and generating Prisma client via local binary...');
    execSync(`"${process.execPath}" "${prismaCli}" generate`, {
      cwd: __dirname,
      stdio: 'inherit',
      env: process.env,
    });
    console.log('Prisma client generated successfully.');
  } else {
    execSync('npx prisma generate', {
      cwd: __dirname,
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: `${path.join(__dirname, 'node_modules/.bin')}:${process.env.PATH || ''}`,
      },
    });
    console.log('Prisma client generated.');
  }
} catch (err) {
  console.error('Auto prisma generate warning:', err.message);
}

// LiteSpeed (lsnode.js) loads this file via require(), so do NOT use top-level 'await'!
import('./dist/server.js').catch((err) => {
  console.error('Server startup error:', err);
});
