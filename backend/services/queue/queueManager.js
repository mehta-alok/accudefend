/**
 * AccuDefend - BullMQ Queue Manager
 *
 * Centralized queue definitions and worker initialization for
 * two-way PMS and dispute portal sync operations.
 *
 * Queues:
 *   pms-inbound       — Process inbound PMS webhook events
 *   pms-outbound      — Send data to PMS systems
 *   dispute-inbound   — Process inbound dispute portal webhooks
 *   dispute-outbound  — Send evidence/responses to dispute portals
 *   evidence-collection — Auto-collect evidence from PMS on new chargebacks
 *   scheduled-sync    — Periodic sync jobs (PMS + dispute portals)
 */

const { Queue, Worker } = require('bullmq');
const logger = require('../../utils/logger');

// Redis connection config — reuse existing Redis URL
const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null // Required by BullMQ
};

// Default job options
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000 // 2s, 4s, 8s
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep completed jobs for 24 hours
    count: 1000     // Keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600 // Keep failed jobs for 7 days
  }
};

// ===========================
// Queue Definitions
// ===========================

const queues = {};
const workers = {};

function getQueue(name) {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: REDIS_CONNECTION,
      defaultJobOptions: DEFAULT_JOB_OPTIONS
    });
    logger.info(`[QueueManager] Queue created: ${name}`);
  }
  return queues[name];
}

// Convenience accessors
const getQueues = () => ({
  pmsInbound: getQueue('pms-inbound'),
  pmsOutbound: getQueue('pms-outbound'),
  disputeInbound: getQueue('dispute-inbound'),
  disputeOutbound: getQueue('dispute-outbound'),
  evidenceCollection: getQueue('evidence-collection'),
  scheduledSync: getQueue('scheduled-sync')
});

// ===========================
// Worker Initialization
// ===========================

async function initializeWorkers() {
  logger.info('[QueueManager] Initializing BullMQ workers...');

  try {
    // PMS Inbound Worker
    const pmsInboundProcessor = require('./workers/pmsInboundWorker');
    workers['pms-inbound'] = new Worker('pms-inbound', pmsInboundProcessor, {
      connection: REDIS_CONNECTION,
      concurrency: 5,
      limiter: {
        max: 50,
        duration: 60000 // 50 jobs per minute
      }
    });
    _attachWorkerEvents(workers['pms-inbound'], 'pms-inbound');

    // PMS Outbound Worker
    const pmsOutboundProcessor = require('./workers/pmsOutboundWorker');
    workers['pms-outbound'] = new Worker('pms-outbound', pmsOutboundProcessor, {
      connection: REDIS_CONNECTION,
      concurrency: 3,
      limiter: {
        max: 30,
        duration: 60000 // 30 jobs per minute (respect PMS rate limits)
      }
    });
    _attachWorkerEvents(workers['pms-outbound'], 'pms-outbound');

    // Dispute Inbound Worker
    const disputeInboundProcessor = require('./workers/disputeInboundWorker');
    workers['dispute-inbound'] = new Worker('dispute-inbound', disputeInboundProcessor, {
      connection: REDIS_CONNECTION,
      concurrency: 5
    });
    _attachWorkerEvents(workers['dispute-inbound'], 'dispute-inbound');

    // Dispute Outbound Worker
    const disputeOutboundProcessor = require('./workers/disputeOutboundWorker');
    workers['dispute-outbound'] = new Worker('dispute-outbound', disputeOutboundProcessor, {
      connection: REDIS_CONNECTION,
      concurrency: 3
    });
    _attachWorkerEvents(workers['dispute-outbound'], 'dispute-outbound');

    // Evidence Collection Worker (high priority, lower concurrency)
    const evidenceCollectionProcessor = require('./workers/evidenceCollectionWorker');
    workers['evidence-collection'] = new Worker('evidence-collection', evidenceCollectionProcessor, {
      connection: REDIS_CONNECTION,
      concurrency: 2 // Lower concurrency — each job does multiple PMS API calls
    });
    _attachWorkerEvents(workers['evidence-collection'], 'evidence-collection');

    // Scheduled Sync Worker
    const scheduledSyncProcessor = require('./workers/scheduledSyncWorker');
    workers['scheduled-sync'] = new Worker('scheduled-sync', scheduledSyncProcessor, {
      connection: REDIS_CONNECTION,
      concurrency: 1 // Only one sync at a time
    });
    _attachWorkerEvents(workers['scheduled-sync'], 'scheduled-sync');

    logger.info(`[QueueManager] ${Object.keys(workers).length} workers initialized`);
  } catch (error) {
    logger.error('[QueueManager] Failed to initialize workers:', error.message);
    throw error;
  }
}

/**
 * Attach standard event handlers to a worker for logging
 */
function _attachWorkerEvents(worker, name) {
  worker.on('completed', (job) => {
    logger.info(`[Worker:${name}] Job ${job.id} completed`, {
      jobName: job.name,
      duration: job.finishedOn - job.processedOn
    });
  });

  worker.on('failed', (job, error) => {
    logger.error(`[Worker:${name}] Job ${job?.id} failed:`, {
      jobName: job?.name,
      error: error.message,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts
    });
  });

  worker.on('error', (error) => {
    logger.error(`[Worker:${name}] Worker error:`, error.message);
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[Worker:${name}] Job ${jobId} stalled`);
  });
}

// ===========================
// Graceful Shutdown
// ===========================

async function shutdownWorkers() {
  logger.info('[QueueManager] Shutting down workers...');

  const closePromises = [];

  for (const [name, worker] of Object.entries(workers)) {
    logger.info(`[QueueManager] Closing worker: ${name}`);
    closePromises.push(worker.close());
  }

  for (const [name, queue] of Object.entries(queues)) {
    logger.info(`[QueueManager] Closing queue: ${name}`);
    closePromises.push(queue.close());
  }

  await Promise.all(closePromises);
  logger.info('[QueueManager] All workers and queues closed');
}

// ===========================
// Queue Health / Stats
// ===========================

async function getQueueStats() {
  const stats = {};

  for (const [name, queue] of Object.entries(queues)) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount()
      ]);

      stats[name] = { waiting, active, completed, failed, delayed };
    } catch (error) {
      stats[name] = { error: error.message };
    }
  }

  return stats;
}

module.exports = {
  getQueue,
  getQueues,
  initializeWorkers,
  shutdownWorkers,
  getQueueStats,
  REDIS_CONNECTION
};
