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
    await client.$connect();

    // Verify connection with a simple query
    await client.$queryRaw`SELECT 1 as connected`;

    logger.info('AccuDefend: Database connection established');
    return client;
  } catch (error) {
    logger.error('Database connection failed:', error);
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
