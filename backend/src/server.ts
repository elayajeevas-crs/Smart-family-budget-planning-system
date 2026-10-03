import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { processDueRecurring } from './services/recurring.service';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Smart Family Budget API running on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
});

// Create auto-recurring expenses that came due (also done lazily when pages load).
const timer = setInterval(
  () => {
    processDueRecurring().catch((err) => console.error('Recurring processing failed', err));
  },
  60 * 60 * 1000,
);
processDueRecurring().catch((err) => console.error('Recurring processing failed', err));

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  clearInterval(timer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
