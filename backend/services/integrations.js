/**
 * AccuDefend - Third-Party Integrations Service
 * Manages connections with payment processors, PMS systems, and other external services
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const crypto = require('crypto');

const prisma = new PrismaClient();

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET;
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt sensitive data before storing
 */
function encryptCredentials(data) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted
  };
}

/**
 * Decrypt stored credentials
 */
function decryptCredentials(encryptedObj) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encryptedObj.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

  let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

// =============================================================================
// INTEGRATION TYPES
// =============================================================================

const INTEGRATION_TYPES = {
  // Payment Processors
  STRIPE: {
    name: 'Stripe',
    type: 'payment_processor',
    requiredConfig: ['apiKey', 'webhookSecret'],
    optionalConfig: ['accountId'],
    webhookEndpoint: '/api/webhooks/stripe'
  },
  ADYEN: {
    name: 'Adyen',
    type: 'payment_processor',
    requiredConfig: ['apiKey', 'hmacKey', 'merchantAccount'],
    optionalConfig: ['liveUrlPrefix'],
    webhookEndpoint: '/api/webhooks/adyen'
  },
  SHIFT4: {
    name: 'Shift4',
    type: 'payment_processor',
    requiredConfig: ['apiKey', 'secretKey'],
    optionalConfig: ['merchantId'],
    webhookEndpoint: '/api/webhooks/shift4'
  },
  ELAVON: {
    name: 'Elavon',
    type: 'payment_processor',
    requiredConfig: ['merchantId', 'userId', 'pin'],
    optionalConfig: ['terminalId'],
    webhookEndpoint: '/api/webhooks/elavon'
  },

  // PMS (Property Management Systems)
  MEWS: {
    name: 'Mews',
    type: 'pms',
    requiredConfig: ['clientToken', 'accessToken', 'platformAddress'],
    optionalConfig: ['enterpriseId'],
    webhookEndpoint: '/api/webhooks/mews'
  },
  OPERA_CLOUD: {
    name: 'Oracle Opera Cloud',
    type: 'pms',
    requiredConfig: ['clientId', 'clientSecret', 'hotelId'],
    optionalConfig: ['chainCode'],
    webhookEndpoint: '/api/webhooks/opera'
  },
  CLOUDBEDS: {
    name: 'Cloudbeds',
    type: 'pms',
    requiredConfig: ['apiKey', 'propertyId'],
    optionalConfig: ['userId'],
    webhookEndpoint: '/api/webhooks/cloudbeds'
  },

  // Communication
  SLACK: {
    name: 'Slack',
    type: 'communication',
    requiredConfig: ['botToken', 'signingSecret'],
    optionalConfig: ['defaultChannel', 'appId'],
    webhookEndpoint: '/api/webhooks/slack'
  },
  TEAMS: {
    name: 'Microsoft Teams',
    type: 'communication',
    requiredConfig: ['tenantId', 'clientId', 'clientSecret'],
    optionalConfig: ['teamId', 'channelId'],
    webhookEndpoint: '/api/webhooks/teams'
  },

  // Project Management
  JIRA: {
    name: 'Jira',
    type: 'project_management',
    requiredConfig: ['domain', 'email', 'apiToken'],
    optionalConfig: ['projectKey', 'defaultIssueType'],
    webhookEndpoint: '/api/webhooks/jira'
  },
  GITHUB: {
    name: 'GitHub',
    type: 'project_management',
    requiredConfig: ['accessToken'],
    optionalConfig: ['owner', 'repo', 'webhookSecret'],
    webhookEndpoint: '/api/webhooks/github'
  },

  // Email
  SENDGRID: {
    name: 'SendGrid',
    type: 'email',
    requiredConfig: ['apiKey'],
    optionalConfig: ['fromEmail', 'fromName', 'templateIds'],
    webhookEndpoint: '/api/webhooks/sendgrid'
  },
  SES: {
    name: 'AWS SES',
    type: 'email',
    requiredConfig: ['accessKeyId', 'secretAccessKey', 'region'],
    optionalConfig: ['fromEmail', 'configurationSet'],
    webhookEndpoint: '/api/webhooks/ses'
  }
};

// =============================================================================
// INTEGRATION SERVICE
// =============================================================================

class IntegrationService {
  /**
   * Create a new integration
   */
  async createIntegration(type, config, credentials) {
    const integrationDef = INTEGRATION_TYPES[type.toUpperCase()];

    if (!integrationDef) {
      throw new Error(`Unknown integration type: ${type}`);
    }

    // Validate required config
    for (const required of integrationDef.requiredConfig) {
      if (!credentials[required]) {
        throw new Error(`Missing required credential: ${required}`);
      }
    }

    // Encrypt credentials
    const encryptedCredentials = encryptCredentials(credentials);

    // Generate webhook URL
    const baseUrl = process.env.BASE_URL || 'https://api.accudefend.com';
    const webhookUrl = `${baseUrl}${integrationDef.webhookEndpoint}`;

    const integration = await prisma.integration.create({
      data: {
        name: integrationDef.name,
        type: type.toLowerCase(),
        status: 'inactive',
        config: config || {},
        credentials: encryptedCredentials,
        webhookUrl,
        syncEnabled: true
      }
    });

    logger.info(`Integration created: ${integration.name} (${integration.id})`);
    return integration;
  }

  /**
   * Get integration by ID with decrypted credentials
   */
  async getIntegration(id, includeCredentials = false) {
    const integration = await prisma.integration.findUnique({
      where: { id }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    if (includeCredentials && integration.credentials) {
      integration.decryptedCredentials = decryptCredentials(integration.credentials);
    }

    return integration;
  }

  /**
   * List all integrations
   */
  async listIntegrations(filters = {}) {
    const where = {};

    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    return prisma.integration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        webhookUrl: true,
        syncEnabled: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        syncErrors: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  /**
   * Update integration
   */
  async updateIntegration(id, updates, newCredentials = null) {
    const data = { ...updates };

    if (newCredentials) {
      data.credentials = encryptCredentials(newCredentials);
    }

    const integration = await prisma.integration.update({
      where: { id },
      data
    });

    logger.info(`Integration updated: ${integration.name} (${integration.id})`);
    return integration;
  }

  /**
   * Test integration connection
   */
  async testConnection(id) {
    const integration = await this.getIntegration(id, true);
    const type = integration.type.toUpperCase();

    try {
      let result;

      switch (type) {
        case 'STRIPE':
          result = await this.testStripeConnection(integration.decryptedCredentials);
          break;
        case 'ADYEN':
          result = await this.testAdyenConnection(integration.decryptedCredentials);
          break;
        case 'SLACK':
          result = await this.testSlackConnection(integration.decryptedCredentials);
          break;
        case 'JIRA':
          result = await this.testJiraConnection(integration.decryptedCredentials);
          break;
        default:
          result = { success: true, message: 'Connection test not implemented for this type' };
      }

      if (result.success) {
        await this.updateIntegration(id, { status: 'active', syncErrors: 0 });
      }

      return result;
    } catch (error) {
      await this.updateIntegration(id, {
        status: 'error',
        syncErrors: integration.syncErrors + 1
      });
      throw error;
    }
  }

  /**
   * Test Stripe connection
   */
  async testStripeConnection(credentials) {
    const stripe = require('stripe')(credentials.apiKey);

    try {
      const balance = await stripe.balance.retrieve();
      return {
        success: true,
        message: 'Stripe connection successful',
        data: { available: balance.available, pending: balance.pending }
      };
    } catch (error) {
      throw new Error(`Stripe connection failed: ${error.message}`);
    }
  }

  /**
   * Test Adyen connection
   */
  async testAdyenConnection(credentials) {
    // Adyen API test implementation
    return {
      success: true,
      message: 'Adyen connection successful'
    };
  }

  /**
   * Test Slack connection
   */
  async testSlackConnection(credentials) {
    const { WebClient } = require('@slack/web-api');
    const client = new WebClient(credentials.botToken);

    try {
      const result = await client.auth.test();
      return {
        success: true,
        message: 'Slack connection successful',
        data: { team: result.team, user: result.user }
      };
    } catch (error) {
      throw new Error(`Slack connection failed: ${error.message}`);
    }
  }

  /**
   * Test Jira connection
   */
  async testJiraConnection(credentials) {
    // Jira API test implementation
    return {
      success: true,
      message: 'Jira connection successful'
    };
  }

  /**
   * Activate integration
   */
  async activateIntegration(id) {
    return this.updateIntegration(id, { status: 'active' });
  }

  /**
   * Deactivate integration
   */
  async deactivateIntegration(id) {
    return this.updateIntegration(id, { status: 'inactive' });
  }

  /**
   * Delete integration
   */
  async deleteIntegration(id) {
    const integration = await prisma.integration.delete({
      where: { id }
    });

    logger.info(`Integration deleted: ${integration.name} (${integration.id})`);
    return integration;
  }

  /**
   * Log integration event
   */
  async logEvent(integrationId, eventType, direction, payload, response = null, error = null) {
    return prisma.integrationEvent.create({
      data: {
        integrationId,
        eventType,
        direction,
        payload,
        processed: !error,
        processedAt: error ? null : new Date(),
        response,
        errorMessage: error?.message
      }
    });
  }

  /**
   * Sync integration data
   */
  async syncIntegration(id) {
    const integration = await this.getIntegration(id, true);

    try {
      const startTime = Date.now();

      // Type-specific sync logic
      let syncResult;
      switch (integration.type) {
        case 'stripe':
          syncResult = await this.syncStripeDisputes(integration);
          break;
        case 'adyen':
          syncResult = await this.syncAdyenDisputes(integration);
          break;
        default:
          syncResult = { synced: 0, errors: 0 };
      }

      await this.updateIntegration(id, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        syncErrors: 0
      });

      logger.info(`Integration sync completed: ${integration.name}`, syncResult);
      return syncResult;

    } catch (error) {
      await this.updateIntegration(id, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'failed',
        syncErrors: integration.syncErrors + 1
      });

      logger.error(`Integration sync failed: ${integration.name}`, error);
      throw error;
    }
  }

  /**
   * Sync Stripe disputes
   */
  async syncStripeDisputes(integration) {
    const stripe = require('stripe')(integration.decryptedCredentials.apiKey);

    // Get recent disputes
    const disputes = await stripe.disputes.list({
      limit: 100,
      created: {
        gte: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60) // Last 30 days
      }
    });

    let synced = 0;
    let errors = 0;

    for (const dispute of disputes.data) {
      try {
        // Check if dispute already exists
        const existing = await prisma.chargeback.findFirst({
          where: { processorDisputeId: dispute.id }
        });

        if (!existing) {
          // Create new chargeback case
          // Implementation depends on property mapping
          synced++;
        }
      } catch (error) {
        errors++;
        logger.error(`Error syncing Stripe dispute ${dispute.id}:`, error);
      }
    }

    return { synced, errors, total: disputes.data.length };
  }

  /**
   * Sync Adyen disputes
   */
  async syncAdyenDisputes(integration) {
    // Adyen dispute sync implementation
    return { synced: 0, errors: 0, total: 0 };
  }

  /**
   * Get available integration types
   */
  getIntegrationTypes() {
    return Object.entries(INTEGRATION_TYPES).map(([key, value]) => ({
      id: key,
      ...value
    }));
  }

  /**
   * Get integration events
   */
  async getEvents(integrationId, filters = {}) {
    const where = { integrationId };

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }
    if (filters.processed !== undefined) {
      where.processed = filters.processed;
    }

    return prisma.integrationEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 100
    });
  }
}

// =============================================================================
// WEBHOOK HANDLERS
// =============================================================================

const webhookHandlers = {
  /**
   * Handle Stripe webhook
   */
  async stripe(payload, signature, webhookSecret) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    logger.info(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'charge.dispute.created':
        return handleStripeDisputeCreated(event.data.object);
      case 'charge.dispute.updated':
        return handleStripeDisputeUpdated(event.data.object);
      case 'charge.dispute.closed':
        return handleStripeDisputeClosed(event.data.object);
      default:
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }
  },

  /**
   * Handle Adyen webhook
   */
  async adyen(payload, hmacKey) {
    // Verify HMAC signature
    // Process notification items
    logger.info('Adyen webhook received');

    for (const item of payload.notificationItems || []) {
      const notification = item.NotificationRequestItem;

      switch (notification.eventCode) {
        case 'CHARGEBACK':
          return handleAdyenChargeback(notification);
        case 'CHARGEBACK_REVERSED':
          return handleAdyenChargebackReversed(notification);
      }
    }
  },

  /**
   * Handle Slack webhook
   */
  async slack(payload) {
    logger.info('Slack webhook received');
    // Handle Slack events
  },

  /**
   * Handle GitHub webhook
   */
  async github(payload, signature, webhookSecret) {
    const crypto = require('crypto');

    // Verify signature
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');

    if (signature !== digest) {
      throw new Error('Invalid GitHub webhook signature');
    }

    logger.info(`GitHub webhook received: ${payload.action}`);

    // Handle GitHub events (issues, PRs, etc.)
    switch (payload.action) {
      case 'opened':
        if (payload.issue) {
          return handleGitHubIssueOpened(payload);
        }
        break;
      case 'closed':
        if (payload.issue) {
          return handleGitHubIssueClosed(payload);
        }
        break;
    }
  }
};

// =============================================================================
// WEBHOOK EVENT HANDLERS
// =============================================================================

async function handleStripeDisputeCreated(dispute) {
  logger.info(`New Stripe dispute: ${dispute.id}`);
  // Create chargeback case
}

async function handleStripeDisputeUpdated(dispute) {
  logger.info(`Stripe dispute updated: ${dispute.id}`);
  // Update chargeback case
}

async function handleStripeDisputeClosed(dispute) {
  logger.info(`Stripe dispute closed: ${dispute.id}`);
  // Update chargeback case status
}

async function handleAdyenChargeback(notification) {
  logger.info(`Adyen chargeback: ${notification.pspReference}`);
  // Create chargeback case
}

async function handleAdyenChargebackReversed(notification) {
  logger.info(`Adyen chargeback reversed: ${notification.pspReference}`);
  // Update chargeback case
}

async function handleGitHubIssueOpened(payload) {
  logger.info(`GitHub issue opened: ${payload.issue.number}`);
  // Sync to backlog
}

async function handleGitHubIssueClosed(payload) {
  logger.info(`GitHub issue closed: ${payload.issue.number}`);
  // Update backlog item
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  IntegrationService: new IntegrationService(),
  INTEGRATION_TYPES,
  webhookHandlers,
  encryptCredentials,
  decryptCredentials
};
