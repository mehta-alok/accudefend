/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * PMS Integration Routes
 * API endpoints for Property Management System integrations
 */

const express = require('express');
const router = express.Router();
const { PMSIntegrationService } = require('../services/pmsIntegration');
const logger = require('../utils/logger');

const pmsService = new PMSIntegrationService();

// In-memory storage for POC (use database in production)
const pmsConnections = new Map();

/**
 * GET /api/pms/systems
 * Get all supported PMS systems
 */
router.get('/systems', (req, res) => {
  try {
    const systems = pmsService.getSupportedSystems();
    res.json({
      success: true,
      systems
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pms/connections
 * Get all PMS connections for the current property
 */
router.get('/connections', (req, res) => {
  try {
    const propertyId = req.query.propertyId || 'default';
    const connections = Array.from(pmsConnections.values())
      .filter(conn => conn.propertyId === propertyId);

    res.json({
      success: true,
      connections: connections.map(conn => ({
        id: conn.id,
        pmsType: conn.pmsType,
        pmsName: conn.pmsName,
        status: conn.status,
        connectedAt: conn.connectedAt,
        lastSyncAt: conn.lastSyncAt,
        evidenceTypes: conn.evidenceTypes
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pms/connect/oauth
 * Initiate OAuth2 connection
 */
router.post('/connect/oauth', async (req, res) => {
  try {
    const { pmsType, propertyId, redirectUri } = req.body;

    if (!pmsType || !redirectUri) {
      return res.status(400).json({
        success: false,
        error: 'pmsType and redirectUri are required'
      });
    }

    const result = await pmsService.initiateOAuth(
      pmsType,
      propertyId || 'default',
      redirectUri
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pms/connect/oauth/callback
 * Complete OAuth2 connection
 */
router.post('/connect/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'code and state are required'
      });
    }

    const connection = await pmsService.completeOAuth(code, state);
    pmsConnections.set(connection.id, connection);

    res.json({
      success: true,
      connection: {
        id: connection.id,
        pmsType: connection.pmsType,
        pmsName: connection.pmsName,
        status: connection.status,
        connectedAt: connection.connectedAt,
        evidenceTypes: connection.evidenceTypes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pms/connect/apikey
 * Connect with API Key (for systems like AutoClerk, Mews)
 */
router.post('/connect/apikey', async (req, res) => {
  try {
    const { pmsType, propertyId, apiKey, apiSecret } = req.body;

    if (!pmsType || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'pmsType and apiKey are required'
      });
    }

    const connection = await pmsService.connectWithApiKey(
      pmsType,
      propertyId || 'default',
      apiKey,
      apiSecret
    );

    pmsConnections.set(connection.id, connection);

    res.json({
      success: true,
      connection: {
        id: connection.id,
        pmsType: connection.pmsType,
        pmsName: connection.pmsName,
        status: connection.status,
        connectedAt: connection.connectedAt,
        evidenceTypes: connection.evidenceTypes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pms/connect/basic
 * Connect with Basic Auth (for systems like protel)
 */
router.post('/connect/basic', async (req, res) => {
  try {
    const { pmsType, propertyId, username, password, hotelCode } = req.body;

    if (!pmsType || !username || !password || !hotelCode) {
      return res.status(400).json({
        success: false,
        error: 'pmsType, username, password, and hotelCode are required'
      });
    }

    const connection = await pmsService.connectWithBasicAuth(
      pmsType,
      propertyId || 'default',
      username,
      password,
      hotelCode
    );

    pmsConnections.set(connection.id, connection);

    res.json({
      success: true,
      connection: {
        id: connection.id,
        pmsType: connection.pmsType,
        pmsName: connection.pmsName,
        status: connection.status,
        connectedAt: connection.connectedAt,
        evidenceTypes: connection.evidenceTypes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pms/search
 * Search for reservation in connected PMS
 */
router.post('/search', async (req, res) => {
  try {
    const { connectionId, confirmationNumber, guestName, checkInDate, checkOutDate, cardLast4 } = req.body;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: 'connectionId is required'
      });
    }

    const result = await pmsService.searchReservation(connectionId, {
      confirmationNumber,
      guestName,
      checkInDate,
      checkOutDate,
      cardLast4
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pms/evidence
 * Fetch evidence from PMS for a reservation
 */
router.post('/evidence', async (req, res) => {
  try {
    const { connectionId, confirmationNumber, evidenceTypes } = req.body;

    if (!connectionId || !confirmationNumber) {
      return res.status(400).json({
        success: false,
        error: 'connectionId and confirmationNumber are required'
      });
    }

    const result = await pmsService.fetchEvidence(
      connectionId,
      confirmationNumber,
      evidenceTypes || []
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pms/evidence/:evidenceId/download
 * Download specific evidence document
 */
router.get('/evidence/:evidenceId/download', async (req, res) => {
  try {
    const { evidenceId } = req.params;
    const { connectionId } = req.query;

    const result = await pmsService.downloadEvidence(connectionId, evidenceId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pms/evidence/attach
 * Attach evidence to a chargeback case
 */
router.post('/evidence/attach', async (req, res) => {
  try {
    const { caseId, evidenceIds, connectionId } = req.body;

    if (!caseId || !evidenceIds || !evidenceIds.length) {
      return res.status(400).json({
        success: false,
        error: 'caseId and evidenceIds are required'
      });
    }

    const result = await pmsService.attachEvidenceToCase(caseId, evidenceIds, connectionId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pms/connection/:connectionId/status
 * Get connection status
 */
router.get('/connection/:connectionId/status', async (req, res) => {
  try {
    const { connectionId } = req.params;

    const result = await pmsService.getConnectionStatus(connectionId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pms/integrations
 * Get all PMS integrations (alias for connections with enhanced data)
 */
router.get('/integrations', (req, res) => {
  try {
    const systems = pmsService.getSupportedSystems();
    const connections = Array.from(pmsConnections.values());

    // Build integrations list from connections + available systems
    const integrations = systems.map(sys => {
      const conn = connections.find(c => c.pmsType === sys.id);
      return {
        id: conn ? conn.id : sys.id,
        name: sys.name || sys.id,
        type: sys.id,
        status: conn ? conn.status : 'available',
        connected: !!conn,
        connectedAt: conn ? conn.connectedAt : null,
        lastSyncAt: conn ? conn.lastSyncAt : null,
        evidenceTypes: conn ? conn.evidenceTypes : sys.evidenceTypes || [],
        authMethod: sys.authMethod || 'api_key',
        features: sys.features || []
      };
    });

    res.json({
      success: true,
      integrations,
      total: integrations.length,
      connected: integrations.filter(i => i.connected).length
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('PMS integrations: returning demo data');
    res.json({
      success: true,
      integrations: [
        { id: 'opera-cloud', name: 'Oracle OPERA Cloud', type: 'OPERA_CLOUD', status: 'active', connected: true, connectedAt: new Date(Date.now() - 30*86400000).toISOString(), lastSyncAt: new Date(Date.now() - 3600000).toISOString(), authMethod: 'oauth2', features: ['folio', 'registration', 'id_scan', 'key_card'] },
        { id: 'mews', name: 'Mews Systems', type: 'MEWS', status: 'active', connected: true, connectedAt: new Date(Date.now() - 20*86400000).toISOString(), lastSyncAt: new Date(Date.now() - 7200000).toISOString(), authMethod: 'api_key', features: ['folio', 'registration', 'payment'] },
        { id: 'cloudbeds', name: 'Cloudbeds', type: 'CLOUDBEDS', status: 'available', connected: false, connectedAt: null, lastSyncAt: null, authMethod: 'oauth2', features: ['folio', 'reservation'] },
        { id: 'autoclerk', name: 'AutoClerk', type: 'AUTOCLERK', status: 'available', connected: false, connectedAt: null, lastSyncAt: null, authMethod: 'api_key', features: ['folio', 'registration'] }
      ],
      total: 4,
      connected: 2,
      isDemo: true
    });
  }
});

/**
 * DELETE /api/pms/connection/:connectionId
 * Disconnect PMS
 */
router.delete('/connection/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;

    const result = await pmsService.disconnect(connectionId);
    pmsConnections.delete(connectionId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
