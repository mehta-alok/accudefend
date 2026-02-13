/**
 * AccuDefend - Scheduled Sync Setup
 *
 * Configures BullMQ repeatable jobs for periodic PMS and
 * dispute portal synchronization.
 */

const { prisma } = require('../../config/database');
const { getQueue } = require('./queueManager');
const logger = require('../../utils/logger');

// Sync intervals (in milliseconds)
const PMS_SYNC_INTERVAL = parseInt(process.env.PMS_SYNC_INTERVAL_MS) || 15 * 60 * 1000;       // 15 minutes
const DISPUTE_SYNC_INTERVAL = parseInt(process.env.DISPUTE_SYNC_INTERVAL_MS) || 10 * 60 * 1000; // 10 minutes

/**
 * Initialize scheduled sync jobs for all active integrations.
 * Called during server startup after workers are initialized.
 */
async function initializeScheduledSyncs() {
  logger.info('[ScheduledSync] Initializing scheduled sync jobs...');

  const scheduledSyncQueue = getQueue('scheduled-sync');

  // Clear any existing repeatable jobs to avoid duplicates on restart
  const existingJobs = await scheduledSyncQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await scheduledSyncQueue.removeRepeatableByKey(job.key);
  }

  // Get all active integrations
  const integrations = await prisma.integration.findMany({
    where: {
      status: 'active',
      syncEnabled: true
    }
  });

  let pmsCount = 0;
  let disputeCount = 0;

  for (const integration of integrations) {
    const integrationType = integration.type.toLowerCase();

    // Determine if this is a PMS or dispute integration
    const isPms = _isPmsIntegration(integrationType);
    const isDispute = _isDisputeIntegration(integrationType);

    if (isPms) {
      const pmsType = _extractPmsType(integrationType);
      await scheduledSyncQueue.add(
        `pms-sync-${integration.id}`,
        {
          integrationId: integration.id,
          type: 'pms',
          adapterType: pmsType,
          syncType: 'incremental'
        },
        {
          repeat: { every: PMS_SYNC_INTERVAL },
          jobId: `pms-sync-${integration.id}`,
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 50 }
        }
      );
      pmsCount++;
      logger.info(`[ScheduledSync] PMS sync scheduled: ${pmsType} (every ${PMS_SYNC_INTERVAL / 60000}min)`);
    }

    if (isDispute) {
      const portalType = _extractPortalType(integrationType);
      await scheduledSyncQueue.add(
        `dispute-sync-${integration.id}`,
        {
          integrationId: integration.id,
          type: 'dispute',
          adapterType: portalType,
          syncType: 'incremental'
        },
        {
          repeat: { every: DISPUTE_SYNC_INTERVAL },
          jobId: `dispute-sync-${integration.id}`,
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 50 }
        }
      );
      disputeCount++;
      logger.info(`[ScheduledSync] Dispute sync scheduled: ${portalType} (every ${DISPUTE_SYNC_INTERVAL / 60000}min)`);
    }
  }

  logger.info(`[ScheduledSync] Initialized ${pmsCount} PMS + ${disputeCount} dispute sync jobs`);
}

/**
 * Add a sync job for a newly created integration.
 */
async function addSyncJob(integrationId, integrationType) {
  const scheduledSyncQueue = getQueue('scheduled-sync');
  const type = integrationType.toLowerCase();

  if (_isPmsIntegration(type)) {
    const pmsType = _extractPmsType(type);
    await scheduledSyncQueue.add(
      `pms-sync-${integrationId}`,
      {
        integrationId,
        type: 'pms',
        adapterType: pmsType,
        syncType: 'incremental'
      },
      {
        repeat: { every: PMS_SYNC_INTERVAL },
        jobId: `pms-sync-${integrationId}`
      }
    );
    logger.info(`[ScheduledSync] Added PMS sync for integration ${integrationId}`);
  }

  if (_isDisputeIntegration(type)) {
    const portalType = _extractPortalType(type);
    await scheduledSyncQueue.add(
      `dispute-sync-${integrationId}`,
      {
        integrationId,
        type: 'dispute',
        adapterType: portalType,
        syncType: 'incremental'
      },
      {
        repeat: { every: DISPUTE_SYNC_INTERVAL },
        jobId: `dispute-sync-${integrationId}`
      }
    );
    logger.info(`[ScheduledSync] Added dispute sync for integration ${integrationId}`);
  }
}

/**
 * Remove sync jobs for a deactivated/deleted integration.
 */
async function removeSyncJob(integrationId) {
  const scheduledSyncQueue = getQueue('scheduled-sync');
  const jobs = await scheduledSyncQueue.getRepeatableJobs();

  for (const job of jobs) {
    if (job.id?.includes(integrationId)) {
      await scheduledSyncQueue.removeRepeatableByKey(job.key);
      logger.info(`[ScheduledSync] Removed sync job: ${job.key}`);
    }
  }
}

/**
 * Trigger a manual sync for a specific integration.
 */
async function triggerManualSync(integrationId, syncType = 'incremental') {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId }
  });

  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  const scheduledSyncQueue = getQueue('scheduled-sync');
  const type = integration.type.toLowerCase();

  const job = await scheduledSyncQueue.add(
    `manual-sync-${integrationId}`,
    {
      integrationId,
      type: _isPmsIntegration(type) ? 'pms' : 'dispute',
      adapterType: _isPmsIntegration(type)
        ? _extractPmsType(type)
        : _extractPortalType(type),
      syncType
    },
    {
      priority: 1, // High priority for manual syncs
      removeOnComplete: { count: 5 }
    }
  );

  logger.info(`[ScheduledSync] Manual sync triggered for ${integrationId}: job ${job.id}`);
  return { jobId: job.id, integrationId, syncType };
}

// === Helper Functions ===

function _isPmsIntegration(type) {
  const pmsTypes = ['opera_cloud', 'mews', 'cloudbeds', 'autoclerk', 'protel',
    'stayntouch', 'apaleo', 'roomkey', 'little_hotelier', 'innroad',
    'webrezpro', 'roommaster', 'pms'];
  return pmsTypes.some(t => type.includes(t));
}

function _isDisputeIntegration(type) {
  const disputeTypes = ['verifi', 'ethoca', 'merlink', 'staysettle',
    'chargebacks911', 'riskified', 'chargeblast', 'midigator',
    'cavu', 'tailoredpay', 'winchargebacks', 'chargebackgurus',
    'chargebackhelp', 'clearview'];
  return disputeTypes.some(t => type.includes(t));
}

function _extractPmsType(type) {
  const cleaned = type.replace(/^pms_/i, '').replace(/_/g, '_');
  return cleaned.toUpperCase();
}

function _extractPortalType(type) {
  const cleaned = type.replace(/^dispute_/i, '');
  return cleaned.toUpperCase();
}

module.exports = {
  initializeScheduledSyncs,
  addSyncJob,
  removeSyncJob,
  triggerManualSync
};
