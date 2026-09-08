'use strict';

const mongoose = require('mongoose');
const { env } = require('./env');

mongoose.set('strictQuery', true);

async function connectDatabase(uri = env.mongoUri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: true,
    // Node's Happy Eyeballs (autoSelectFamily) dual-stack connect logic causes the
    // TLS handshake to Atlas to fail with "tlsv1 alert internal error" on some
    // networks/Node versions. Forcing IPv4 avoids it entirely.
    family: 4,
  });
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

/** Human readable connection state, used by the admin System Health screen. */
function databaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const conn = mongoose.connection;
  return {
    state: states[conn.readyState] || 'unknown',
    readyState: conn.readyState,
    // Never expose credentials — only the logical database name and host.
    database: conn.name || null,
    host: conn.host || null,
  };
}

module.exports = { connectDatabase, disconnectDatabase, databaseStatus };
