/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Dispute Companies Routes
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { DISPUTE_COMPANIES, DisputeCompanyService, disputeWebhookHandlers } = require('../services/disputeCompanies');
const logger = require('../utils/logger');

// Apply authentication to all routes
router.use(authenticateToken);

// =============================================================================
// DISPUTE COMPANY INFORMATION
// =============================================================================

/**
 * GET /api/disputes/companies
 * Get all available dispute management companies
 */
router.get('/companies', (req, res) => {
  const companies = DisputeCompanyService.getAvailableCompanies();

  // Group by category
  const grouped = {
    hospitality: companies.filter(c => c.category === 'hospitality'),
    network: companies.filter(c => c.category === 'network'),
    general: companies.filter(c => c.category === 'general')
  };

  res.json({
    success: true,
    companies,
    grouped,
    total: companies.length
  });
});

/**
 * GET /api/disputes/companies/:id
 * Get specific dispute company details
 */
router.get('/companies/:id', (req, res) => {
  const company = DisputeCompanyService.getCompany(req.params.id);

  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'Dispute company not found'
    });
  }

  res.json({
    success: true,
    company: {
      id: req.params.id.toUpperCase(),
      ...company
    }
  });
});

// =============================================================================
// INTEGRATION MANAGEMENT (ADMIN ONLY)
// =============================================================================

/**
 * POST /api/disputes/integrations
 * Create a new dispute company integration
 */
router.post('/integrations', requireRole('ADMIN'), async (req, res) => {
  try {
    const { companyId, credentials, config } = req.body;

    if (!companyId || !credentials) {
      return res.status(400).json({
        success: false,
        error: 'companyId and credentials are required'
      });
    }

    const integration = await DisputeCompanyService.createIntegration(
      companyId,
      credentials,
      config
    );

    res.status(201).json({
      success: true,
      integration: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
        status: integration.status,
        webhookUrl: integration.webhookUrl,
        createdAt: integration.createdAt
      }
    });
  } catch (error) {
    logger.error('Failed to create dispute integration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/disputes/integrations
 * List all dispute company integrations
 */
router.get('/integrations', async (req, res) => {
  try {
    const { prisma } = require('../config/database');

    const integrations = await prisma.integration.findMany({
      where: {
        type: {
          in: Object.keys(DISPUTE_COMPANIES).map(k => k.toLowerCase())
        }
      },
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
        config: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Add company details
    const enhancedIntegrations = integrations.map(int => {
      const company = DISPUTE_COMPANIES[int.type.toUpperCase()];
      return {
        ...int,
        companyName: company?.fullName,
        logo: company?.logo,
        category: company?.category,
        twoWaySync: company?.twoWaySync,
        features: company?.features
      };
    });

    res.json({
      success: true,
      integrations: enhancedIntegrations,
      total: integrations.length
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Dispute integrations: database unavailable, returning demo data');
    res.json({
      success: true,
      integrations: [
        { id: 'int-chargebacks911', name: 'Chargebacks911', type: 'chargebacks911', status: 'active', webhookUrl: '/api/webhooks/chargebacks911', syncEnabled: true, lastSyncAt: new Date(Date.now() - 3600000).toISOString(), lastSyncStatus: 'SUCCESS', companyName: 'Chargebacks911', category: 'hospitality', twoWaySync: true, features: ['alert_ingestion', 'evidence_submission', 'status_sync'] },
        { id: 'int-midigator', name: 'Midigator by Mastercard', type: 'midigator', status: 'active', webhookUrl: '/api/webhooks/midigator', syncEnabled: true, lastSyncAt: new Date(Date.now() - 7200000).toISOString(), lastSyncStatus: 'SUCCESS', companyName: 'Midigator', category: 'network', twoWaySync: true, features: ['alert_ingestion', 'order_insight', 'collaboration'] },
        { id: 'int-verifi', name: 'Verifi (Visa)', type: 'verifi', status: 'available', webhookUrl: null, syncEnabled: false, lastSyncAt: null, lastSyncStatus: null, companyName: 'Verifi by Visa', category: 'network', twoWaySync: false, features: ['rapid_dispute_resolution', 'order_insight'] }
      ],
      total: 3,
      isDemo: true
    });
  }
});

/**
 * POST /api/disputes/integrations/:id/test
 * Test connection to dispute company
 */
router.post('/integrations/:id/test', requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await DisputeCompanyService.testConnection(req.params.id);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Dispute integration test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/disputes/integrations/:id/sync
 * Sync disputes from company
 */
router.post('/integrations/:id/sync', requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await DisputeCompanyService.syncDisputes(req.params.id);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Dispute sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/disputes/integrations/:id
 * Update dispute company integration
 */
router.patch('/integrations/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const { prisma } = require('../config/database');
    const { status, syncEnabled, config } = req.body;

    const integration = await prisma.integration.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(syncEnabled !== undefined && { syncEnabled }),
        ...(config && { config })
      }
    });

    res.json({
      success: true,
      integration
    });
  } catch (error) {
    logger.error('Failed to update dispute integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update integration'
    });
  }
});

/**
 * DELETE /api/disputes/integrations/:id
 * Delete dispute company integration
 */
router.delete('/integrations/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const { prisma } = require('../config/database');

    await prisma.integration.delete({
      where: { id: req.params.id }
    });

    res.json({
      success: true,
      message: 'Integration deleted'
    });
  } catch (error) {
    logger.error('Failed to delete dispute integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete integration'
    });
  }
});

// =============================================================================
// CASE OPERATIONS
// =============================================================================

/**
 * POST /api/disputes/cases/:caseId/submit
 * Submit evidence to dispute company
 */
router.post('/cases/:caseId/submit', requireRole('ADMIN'), async (req, res) => {
  try {
    const { integrationId, evidenceData } = req.body;

    if (!integrationId) {
      return res.status(400).json({
        success: false,
        error: 'integrationId is required'
      });
    }

    const result = await DisputeCompanyService.submitEvidence(
      integrationId,
      req.params.caseId,
      evidenceData
    );

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Failed to submit to dispute company:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/disputes/cases/:caseId/push
 * Push case update to dispute company (2-way sync)
 */
router.post('/cases/:caseId/push', async (req, res) => {
  try {
    const { prisma } = require('../config/database');

    // Get all active dispute integrations with 2-way sync
    const integrations = await prisma.integration.findMany({
      where: {
        type: { in: Object.keys(DISPUTE_COMPANIES).map(k => k.toLowerCase()) },
        status: 'active',
        syncEnabled: true
      }
    });

    const results = [];

    for (const integration of integrations) {
      try {
        const result = await DisputeCompanyService.pushCaseUpdate(
          integration.id,
          req.params.caseId
        );
        if (result) {
          results.push({ integration: integration.name, success: true });
        }
      } catch (err) {
        results.push({ integration: integration.name, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error('Failed to push case update:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
