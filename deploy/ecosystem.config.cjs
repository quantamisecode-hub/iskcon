/**
 * PM2 process definition for the production backend (serves the built SPA).
 * Start: pm2 start deploy/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'iskcon-api',
      cwd: '/var/www/iskcon/backend',
      script: 'dist/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        // PORT is intentionally NOT hard-coded here. The backend reads
        // process.env.PORT, so the hosting panel or backend/.env supplies it.
      },
      max_memory_restart: '400M',
      restart_delay: 3000,
      time: true,
      out_file: '/var/log/pm2/iskcon-api.out.log',
      error_file: '/var/log/pm2/iskcon-api.err.log',
    },
  ],
};
