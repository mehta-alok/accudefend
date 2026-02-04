/**
 * AccuDefend System
 * Redis Configuration (Caching & Session Management)
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

/**
 * Get or create Redis client
 */
function getRedisClient() {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true
    });

    redisClient.on('connect', () => {
      logger.info('AccuDefend: Redis client connected');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisClient;
}

/**
 * Connect to Redis
 */
async function connectRedis() {
  try {
    const client = getRedisClient();
    await client.connect();
    await client.ping();
    logger.info('AccuDefend: Redis connection verified');
    return client;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
}

/**
 * Token blacklist management for JWT invalidation
 */
const tokenBlacklist = {
  /**
   * Add token to blacklist (on logout)
   */
  async add(token, expiresIn = 7 * 24 * 60 * 60) {
    const client = getRedisClient();
    await client.setex(`blacklist:${token}`, expiresIn, '1');
  },

  /**
   * Check if token is blacklisted
   */
  async isBlacklisted(token) {
    const client = getRedisClient();
    const result = await client.get(`blacklist:${token}`);
    return result === '1';
  }
};

/**
 * Session management
 */
const sessionStore = {
  /**
   * Store refresh token
   */
  async setRefreshToken(userId, token, expiresIn = 7 * 24 * 60 * 60) {
    const client = getRedisClient();
    await client.setex(`refresh:${userId}:${token}`, expiresIn, JSON.stringify({
      createdAt: new Date().toISOString(),
      userId
    }));
  },

  /**
   * Validate refresh token
   */
  async validateRefreshToken(userId, token) {
    const client = getRedisClient();
    const data = await client.get(`refresh:${userId}:${token}`);
    return data ? JSON.parse(data) : null;
  },

  /**
   * Remove refresh token
   */
  async removeRefreshToken(userId, token) {
    const client = getRedisClient();
    await client.del(`refresh:${userId}:${token}`);
  },

  /**
   * Remove all refresh tokens for a user
   */
  async removeAllUserTokens(userId) {
    const client = getRedisClient();
    const keys = await client.keys(`refresh:${userId}:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
};

/**
 * Cache utilities
 */
const cache = {
  /**
   * Get cached value
   */
  async get(key) {
    const client = getRedisClient();
    const value = await client.get(`cache:${key}`);
    return value ? JSON.parse(value) : null;
  },

  /**
   * Set cached value
   */
  async set(key, value, ttl = 300) {
    const client = getRedisClient();
    await client.setex(`cache:${key}`, ttl, JSON.stringify(value));
  },

  /**
   * Delete cached value
   */
  async del(key) {
    const client = getRedisClient();
    await client.del(`cache:${key}`);
  },

  /**
   * Clear cache by pattern
   */
  async clearPattern(pattern) {
    const client = getRedisClient();
    const keys = await client.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
};

module.exports = {
  getRedisClient,
  connectRedis,
  tokenBlacklist,
  sessionStore,
  cache
};
