/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const { tokenBlacklist } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Verify JWT access token
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token required'
      });
    }

    // Check if token is blacklisted
    const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has been revoked'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        propertyId: true,
        property: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found or inactive'
      });
    }

    // Attach user to request
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    logger.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Role-based authorization middleware
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Access denied for user ${req.user.email} - required roles: ${allowedRoles.join(', ')}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
}

/**
 * Property-level access control
 * Ensures users can only access data from their assigned property
 * Admin users bypass this check
 */
function requirePropertyAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // Admins can access all properties
  if (req.user.role === 'ADMIN') {
    return next();
  }

  // Get property ID from request (query, params, or body)
  const requestedPropertyId =
    req.query.propertyId ||
    req.params.propertyId ||
    req.body?.propertyId;

  // If no property ID specified, user can only see their own property's data
  if (!requestedPropertyId) {
    req.propertyFilter = { propertyId: req.user.propertyId };
    return next();
  }

  // Verify user has access to requested property
  if (requestedPropertyId !== req.user.propertyId) {
    logger.warn(`Property access denied for user ${req.user.email} - attempted: ${requestedPropertyId}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied to this property'
    });
  }

  req.propertyFilter = { propertyId: requestedPropertyId };
  next();
}

/**
 * Optional authentication - doesn't fail if no token
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
    if (isBlacklisted) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        propertyId: true
      }
    });

    if (user?.isActive !== false) {
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    // Silently continue without auth
    next();
  }
}

module.exports = {
  authenticateToken,
  requireRole,
  requirePropertyAccess,
  optionalAuth
};
