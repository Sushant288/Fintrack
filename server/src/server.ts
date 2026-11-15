// M0: Starts HTTP + scheduler
import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initScheduler } from './jobs';

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Server running in ${env.NODE_ENV} mode on port ${PORT}`);
  initScheduler();
});

export default server;
