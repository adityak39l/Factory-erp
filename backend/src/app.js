'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const { env } = require('./config/env');
const { swaggerSpec } = require('./config/swagger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const employeeRoutes = require('./modules/employees/employees.routes');
const masterRoutes = require('./modules/masters/masters.routes');
const dprRoutes = require('./modules/dpr/dpr.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const reportRoutes = require('./modules/reports/reports.routes');
const operatorRoutes = require('./modules/operators/operators.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const systemRoutes = require('./modules/system/system.routes');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin / server-to-server requests have no Origin header.
        if (!origin) return callback(null, true);
        if (env.clientOrigins.includes('*') || env.clientOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  // ---- API modules (Phase 1) -------------------------------------------
  // Future phases (Production, Material) mount here as their own modules
  // without touching anything above or below this block.
  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/masters', masterRoutes);
  app.use('/api/dpr', dprRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/operators', operatorRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/system', systemRoutes);

  // ---- API documentation ----------------------------------------------
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Trading Engineers — DPR API',
      swaggerOptions: { persistAuthorization: true },
    })
  );
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

  app.get('/', (req, res) =>
    res.json({
      name: 'Trading Engineers — Factory Employee Management & DPR API',
      version: '1.0.0',
      phase: 'Phase 1 — Employee, Attendance & DPR foundation',
      docs: '/api/docs',
      health: '/api/system/health',
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
