import { buildApp } from './app/build.js';
import { config } from './config/index.js';
import { connectDb, disconnectDb } from './db/prisma.js';
import { ensureEvent, refreshHiddenActivation } from './events/event.service.js';

async function main(): Promise<void> {
  await connectDb();
  // Ensure a singleton event row exists so status reads never 404.
  await ensureEvent();

  const app = await buildApp();

  // Periodically flip hidden-level activation when its scheduled time passes,
  // even if no request triggers the lazy check. Server clock is authoritative.
  const ticker = setInterval(() => {
    refreshHiddenActivation().catch(() => {
      /* event may not exist yet; ignore */
    });
  }, 5000);

  const close = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    clearInterval(ticker);
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void close('SIGINT'));
  process.on('SIGTERM', () => void close('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Doomsday CTF backend listening on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
