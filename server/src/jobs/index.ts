// M4: Jobs scheduler index
import { scheduleRecurringJob } from './recurring.job';
import { scheduleReportJob } from './report.job';
import { scheduleCleanupJob } from './cleanup.job';
import { logger } from '../utils/logger';

export const initScheduler = () => {
  logger.info('Initializing background jobs...');
  scheduleRecurringJob();
  scheduleReportJob();
  scheduleCleanupJob();
};
