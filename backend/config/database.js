/**
 * AccuDefend System
 * Database Configuration (PostgreSQL via Prisma)
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

let prisma;

/**
 * Initialize Prisma client with connection pooling
 */
function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' }
      ],
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });

    // Query logging in development
    if (process.env.NODE_ENV === 'development') {
      prisma.$on('query', (e) => {
        logger.debug(`Query: ${e.query}`);
        logger.debug(`Duration: ${e.duration}ms`);
      });
    }
  }
  return prisma;
}

/**
 * Connect to database and verify connection
 */
async function connectDatabase() {
  try {
    const client = getPrismaClient();

    // Add connection timeout (5 seconds) to avoid hanging when DB is unavailable
    const connectPromise = client.$connect().then(() =>
      client.$queryRaw`SELECT 1 as connected`
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout (5s)')), 5000)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    logger.info('AccuDefend: Database connection established');
    return client;
  } catch (error) {
    logger.error('Database connection failed:', error.message || error);
    throw error;
  }
}

/**
 * Disconnect from database
 */
async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  }
}

module.exports = {
  prisma: getPrismaClient(),
  getPrismaClient,
  connectDatabase,
  disconnectDatabase
};
