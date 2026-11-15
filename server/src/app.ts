// M0: Middleware + routes
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { apiRateLimiter } from './middleware/rateLimit';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestId);
app.use(apiRateLimiter);

// Mount API routes under /api/v1
app.use('/api/v1', routes);

// Global Error Handler
app.use(errorHandler);

export default app;
