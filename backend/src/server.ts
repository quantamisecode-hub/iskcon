import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { initSocket } from './lib/socket.js';
import { env } from './config/env.js';
import { disconnectDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

/**
 * Server entry point. Loads .env first, validates environment strictly,
 * then starts the HTTP server with graceful shutdown handling.
 */

const app = createApp();
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
      allowedOrigins: env.ALLOWED_ORIGINS,
    },
    'Food Inventory API started',
  );
});

/** Graceful shutdown: stop accepting requests, close database, exit. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');
  httpServer.close(() => {
    void disconnectDatabase().finally(() => process.exit(0));
  });
  // Safety timeout in case a connection hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception');
});
