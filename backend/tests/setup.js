'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_runs_only_1234567890';
process.env.ENCRYPTION_KEY =
  'aaaaaaaabbbbbbbbccccccccddddddddaaaaaaaabbbbbbbbccccccccdddddddd';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

/**
 * Tests run against an in-memory MongoDB by default (nothing to install).
 * If your environment cannot download the MongoDB binary, point the suite at any
 * throwaway database instead:
 *
 *     MONGO_TEST_URI=mongodb://127.0.0.1:27017/dpr_test npm test
 */
beforeAll(async () => {
  if (process.env.MONGO_TEST_URI) {
    await mongoose.connect(process.env.MONGO_TEST_URI, { dbName: 'dpr_test' });
    return;
  }
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'dpr_test' });
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.connection.close();
  }
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
});
