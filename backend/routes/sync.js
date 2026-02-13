/**
 * AccuDefend - Sync Management API Routes
 *
 * Endpoints for managing two-way sync operations,
 * monitoring sync health, and viewing sync history.
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { triggerManualSync } = require('../services/queue/scheduledSync');
const { getQueueStats } = require('../services/queue/queueManager');

// All routes require authentication
router.use(authenticateToken);

// =========================================================================
// POST /api/sync/trigger — Trigger manual sync for an integration
// =========================================================================
router.post('/trigger', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { integrationId, syncType = 'incremental' } = req.body;

    if (!integrationId) {
      return res.status(400).json({ error: 'integrationId is required' });
    }

    const result = await triggerManualSync(integrationId, syncType);

    res.json({
      message: 'Sync triggered',
      ...result
    });
  } catch (error) {
    logger.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync', message: error.message });
  }
});

// =========================================================================
// GET /api/sync/status — Sync health dashboard
// =========================================================================
router.get('/status', async (req, res) => {
  try {
    // Get all active integrations with sync info
    const integrations = await prisma.integration.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        syncEnabled: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        syncErrors: true,
        createdAt: true,
        _count: {
          select: { events: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Get recent sync logs per integration
    const syncStatuses = [];

    for (const integration of integrations) {
      // Last 5 sync logs
      const recentSyncs = await prisma.syncLog.findMany({
        where: { integrationId: integration.id },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          syncType: true,
          direction: true,
          entityType: true,
          status: true,
          recordsProcessed: true,
          recordsCreated: true,
          recordsUpdated: true,
          recordsFailed: true,
          durationMs: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true
        }
      });

      // Count total synced records
      const [reservationCount, chargebackCount] = await Promise.all([
        prisma.reservation.count({
          where: { syncSource: integration.type.toUpperCase() }
        }),
        prisma.chargeback.count({
          where: { processorDisputeId: { not: null } }
        })
      ]);

      // Calculate uptime / health
      const last24hSyncs = await prisma.syncLog.findMany({
        where: {
          integrationId: integration.id,
          startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        select: { status: true }
      });

      const successRate = last24hSyncs.length > 0
        ? (last24hSyncs.filter(s => s.status === 'completed').length / last24hSyncs.length * 100).toFixed(1)
        : null;

      syncStatuses.push({
        integration: {
          id: integration.id,
          name: integration.name,
          type: integration.type,
          status: integration.status,
          syncEnabled: integration.syncEnabled
        },
        lastSync: {
          at: integration.lastSyncAt,
          status: integration.lastSyncStatus,
          errorCount: integration.syncErrors
        },
        health: {
          successRate: successRate ? `${successRate}%` : 'N/A',
          syncsLast24h: last24hSyncs.length,
          failuresLast24h: last24hSyncs.filter(s => s.status === 'failed').length
        },
        counts: {
          totalEvents: integration._count.events,
          reservationsSynced: reservationCount,
          chargebacksSynced: chargebackCount
        },
        recentSyncs
      });
    }

    // Get queue stats
    let queueHealth;
    try {
      queueHealth = await getQueueStats();
    } catch (e) {
      queueHealth = { error: 'Queue stats unavailable' };
    }

    res.json({
      integrations: syncStatuses,
      queues: queueHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status', message: error.message });
  }
});

// =========================================================================
// GET /api/sync/logs — Paginated sync history
// =========================================================================
router.get('/logs', async (req, res) => {
  try {
    const {
      integrationId, syncType, direction, entityType, status,
      dateFrom, dateTo,
      page = 1, limit = 50
    } = req.query;

    const where = {};
    if (integrationId) where.integrationId = integrationId;
    if (syncType) where.syncType = syncType;
    if (direction) where.direction = direction;
    if (entityType) where.entityType = entityType;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      where.startedAt = {};
      if (dateFrom) where.startedAt.gte = new Date(dateFrom);
      if (dateTo) where.startedAt.lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.syncLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error getting sync logs:', error);
    res.status(500).json({ error: 'Failed to get sync logs', message: error.message });
  }
});

// =========================================================================
// GET /api/sync/conflicts — View data conflicts
// =========================================================================
router.get('/conflicts', requireRole('ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [conflicts, total] = await Promise.all([
      prisma.syncLog.findMany({
        where: { syncType: 'conflict' },
        orderBy: { startedAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.syncLog.count({ where: { syncType: 'conflict' } })
    ]);

    res.json({
      conflicts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error getting conflicts:', error);
    res.status(500).json({ error: 'Failed to get conflicts', message: error.message });
  }
});

module.exports = router;
