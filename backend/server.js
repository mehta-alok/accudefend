/**
 * AccuDefend Hotels Chargeback Defense System
 * Main Server Entry Point
 *
 * AI-powered chargeback dispute management platform
 * for AccuDefend Hotels & Resorts
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initializeS3 } = require('./config/s3');

// Route imports
const authRoutes = require('./routes/auth');
const casesRoutes = require('./routes/cases');
const evidenceRoutes = require('./routes/evidence');
const analyticsRoutes = require('./routes/analytics');
const webhooksRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request logging
app.use(morgan(process.env.LOG_FORMAT || 'combined', {
  stream: { write: (message) => logger.http(message.trim()) }
}));

// Body parsing (raw for webhooks, json for API)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// RATE LIMITING
// =============================================================================

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Auth endpoint rate limit (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 20,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  }
});

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'AccuDefend Chargeback Defense API',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/ready', async (req, res) => {
  try {
    const { prisma } = require('./config/database');
    const redis = require('./config/redis').getRedisClient();

    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis
    await redis.ping();

    res.status(200).json({
      status: 'ready',
      service: 'AccuDefend Chargeback Defense API',
      checks: {
        database: 'connected',
        redis: 'connected',
        s3: 'configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      error: error.message
    });
  }
});

// =============================================================================
// API ROUTES
// =============================================================================

// Apply rate limiters
app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/admin', adminRoutes);

// API documentation redirect
app.get('/api', (req, res) => {
  res.json({
    service: 'AccuDefend Chargeback Defense API',
    version: 'v1',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      cases: '/api/cases',
      evidence: '/api/evidence',
      analytics: '/api/analytics',
      webhooks: '/api/webhooks',
      admin: '/api/admin'
    }
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    service: 'AccuDefend Chargeback Defense API'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
  try {
    logger.info('Starting AccuDefend Chargeback Defense System...');

    // Initialize connections
    await connectDatabase();
    logger.info('Database connected');

    await connectRedis();
    logger.info('Redis connected');

    await initializeS3();
    logger.info('S3 initialized');

    // Start server
    app.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     AccuDefend CHARGEBACK DEFENSE SYSTEM                           ║
║     AI-Powered Dispute Management Platform                    ║
║                                                               ║
║     Server running on port ${PORT}                              ║
║     Environment: ${process.env.NODE_ENV || 'development'}                            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
      `);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  const { prisma } = require('./config/database');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  const { prisma } = require('./config/database');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

module.exports = app;
