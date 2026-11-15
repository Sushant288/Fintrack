// env.ts must be the first import
import { env } from './config/env';
import app from './app';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';

const server = app.listen(env.PORT, () => {
  logger.info(`FinTrack server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}, initiating graceful shutdown...`);

  const shutdownTimeoutMs = 10000;
  const timer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing process termination.');
    process.exit(1);
  }, shutdownTimeoutMs);
  timer.unref();

  server.close(async () => {
    logger.info('HTTP server connection pool closed.');
    try {
      await prisma.$disconnect();
      logger.info('Prisma database connection closed successfully.');
      clearTimeout(timer);
      process.exit(0);
    } catch (err: unknown) {
      logger.error('Error disconnecting from database during shutdown', { error: err });
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection captured', { reason });
});

process.on('uncaughtException', (err: Error) => {
  logger.error('Fatal uncaught exception captured, terminating process', { error: err });
  process.exit(1);
});

export default server;
