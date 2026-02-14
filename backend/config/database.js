/**
 * AccuDefend System
 * Database Configuration (PostgreSQL via Prisma)
 *
 * Uses deferred loading to avoid Node.js v25 hanging on require('@prisma/client')
 * PrismaClient is only loaded when connectDatabase() is called (during server startup).
 * Before that, all prisma model access uses a proxy that throws — caught by demo fallbacks.
 */

const logger = require('../utils/logger');

let prisma;
let prismaReady = false;

/**
 * Create a proxy that defers all model access to the real PrismaClient
 * or throws "database unavailable" errors (caught by demo mode fallbacks).
 */
function createDeferredProxy() {
  return new Proxy({}, {
    get: (target, prop) => {
      // If prisma has been initialized by connectDatabase(), use it
      if (prismaReady && prisma) {
        return prisma[prop];
      }
      // Internal Prisma methods that may be called before connection
      if (prop === '$connect') return async () => { throw new Error('Database unavailable (demo mode)'); };
      if (prop === '$disconnect') return async () => {};
      if (prop === '$queryRaw') return async () => { throw new Error('Database unavailable (demo mode)'); };
      if (prop === '$on') return () => {};
      if (prop === 'then') return undefined; // Prevent Promise-like behavior
      if (typeof prop === 'symbol') return undefined;
      // Model access (chargeback, notification, etc.) — return proxy that throws
      return new Proxy({}, {
        get: (_, method) => {
          if (typeof method === 'symbol') return undefined;
          return async () => { throw new Error('Database unavailable (demo mode)'); };
        }
      });
    }
  });
}

// Export a deferred proxy immediately — no @prisma/client loaded yet
const deferredPrisma = createDeferredProxy();

/**
 * Connect to database and load PrismaClient
 * Only called during server startup in startServer()
 */
async function connectDatabase() {
  try {
    const { PrismaClient } = require('@prisma/client');
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

    // Add connection timeout (5 seconds) to avoid hanging when DB is unavailable
    const connectPromise = prisma.$connect().then(() =>
      prisma.$queryRaw`SELECT 1 as connected`
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout (5s)')), 5000)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    prismaReady = true;
    logger.info('AccuDefend: Database connection established');
    return prisma;
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
  prisma: deferredPrisma,
  getPrismaClient: () => deferredPrisma,
  connectDatabase,
  disconnectDatabase
};
