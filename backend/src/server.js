'use strict';

const { createApp } = require('./app');
const { connectDatabase } = require('./config/db');
const { env, validateEnv } = require('./config/env');

async function start() {
  try {
    validateEnv();
    await connectDatabase();
    // eslint-disable-next-line no-console
    console.log('[db] connected');

    const app = createApp();
    const server = app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(
        `\n  Trading Engineers — DPR API\n` +
          `  ---------------------------------------------\n` +
          `  Environment : ${env.nodeEnv}\n` +
          `  API         : http://localhost:${env.port}\n` +
          `  Docs        : http://localhost:${env.port}/api/docs\n` +
          `  Health      : http://localhost:${env.port}/api/system/health\n`
      );
    });

    const shutdown = (signal) => {
      // eslint-disable-next-line no-console
      console.log(`\n[server] ${signal} received, shutting down gracefully…`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  }
}

start();
