'use strict';

const mongoose = require('mongoose');
const { env } = require('./env');

mongoose.set('strictQuery', true);

let memoryServerInstance = null;

async function connectDatabase(uri = env.mongoUri) {
  // If a remote cloud URI is provided, attempt to connect to it first (5s timeout)
  if (uri && !uri.includes('127.0.0.1') && !uri.includes('localhost')) {
    try {
      console.log('[db] Attempting connection to MongoDB Atlas...');
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        autoIndex: true,
        family: 4,
      });
      console.log('[db] Connected to MongoDB Atlas successfully!');
      return mongoose.connection;
    } catch (err) {
      console.warn(`[db] Atlas connection unavailable (${err.message}).`);
      console.log('[db] Starting persistent local embedded database fallback so the app is always functional...');
    }
  }

  // Persistent Local Embedded Database Fallback
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const path = require('path');
    const fs = require('fs');
    const localDbPath = path.resolve(__dirname, '../../.local_db');
    if (!fs.existsSync(localDbPath)) {
      fs.mkdirSync(localDbPath, { recursive: true });
    } else {
      const lockFile = path.join(localDbPath, 'mongod.lock');
      if (fs.existsSync(lockFile)) {
        try { fs.unlinkSync(lockFile); } catch (_) {}
      }
    }

    if (!memoryServerInstance) {
      memoryServerInstance = await MongoMemoryServer.create({
        instance: {
          dbPath: localDbPath,
          storageEngine: 'wiredTiger',
        },
      });
    }

    const localUri = memoryServerInstance.getUri();
    await mongoose.connect(localUri, {
      autoIndex: true,
    });
    console.log(`[db] Connected to persistent local embedded database at ${localDbPath}`);

    // Ensure initial admin, departments and employees exist
    const Employee = require('../models/Employee');
    const empCount = await Employee.countDocuments();
    if (empCount === 0) {
      console.log('[db] Initializing master data (Admin, Shifts, Departments, Employees)...');
      const { seedData } = require('./seedHelper');
      await seedData({ withDemo: true });
      console.log('[db] Master data initialized.');
    }

    return mongoose.connection;
  } catch (err) {
    console.error('[db] Local database startup failed:', err.message);
    throw err;
  }
}

async function disconnectDatabase() {
  await mongoose.connection.close();
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
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
