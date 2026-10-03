import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import router from './routes';
import { toPlain } from './utils/serialize';

export function createApp() {
  const app = express();
  const origins = env.CLIENT_URL.split(',').map((o) => o.trim());

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Prisma Decimal -> number for every JSON response.
  app.use((_req, res, next) => {
    const original = res.json.bind(res);
    res.json = (body?: unknown) => original(toPlain(body));
    next();
  });

  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export default createApp;
