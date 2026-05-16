import { createApp } from './app.js';
import { config } from './config.js';
import { closePool } from './services/db.js';

const app = createApp();
const requestedPort = config.port;
const maxPortRetries = 20;

let server;

function startServer(port, remainingRetries = maxPortRetries) {
  const instance = app.listen(port, () => {
    console.log(
      JSON.stringify({
        type: 'server_start',
        port,
        requestedPort,
        model: config.anthropicModel,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  instance.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && remainingRetries > 0) {
      const nextPort = port + 1;

      console.warn(
        JSON.stringify({
          type: 'port_in_use',
          requestedPort,
          currentPort: port,
          fallbackPort: nextPort,
          message: `Port ${port} is busy; retrying on ${nextPort}`,
          timestamp: new Date().toISOString(),
        }),
      );

      startServer(nextPort, remainingRetries - 1);
      return;
    }

    console.error(
      JSON.stringify({
        type: 'server_error',
        code: err.code,
        message: err.message,
        requestedPort,
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
  });

  server = instance;
  return instance;
}

startServer(requestedPort);

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
