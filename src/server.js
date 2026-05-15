import { createApp } from './app.js';
import { config } from './config.js';
import { closePool } from './services/db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      type: 'server_start',
      port: config.port,
      model: config.anthropicModel,
      timestamp: new Date().toISOString(),
    }),
  );
});

function shutdown(signal) {
  console.log(
    JSON.stringify({ type: 'shutdown', signal, timestamp: new Date().toISOString() }),
  );

  server.close(async (err) => {
    if (err) {
      console.error(JSON.stringify({ type: 'shutdown_error', message: err.message }));
      process.exit(1);
    }
    await closePool();
    process.exit(0);
  });

  // Force-kill if graceful drain takes too long (e.g. a stuck keep-alive connection)
  setTimeout(() => {
    console.error(JSON.stringify({ type: 'shutdown_timeout', message: 'Forcing exit' }));
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
