/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Merlink Dispute Adapter
 *
 * Extracted and refactored from the original MerlinkService class in
 * backend/services/disputeCompanies.js. Now extends BaseDisputeAdapter
 * to conform to the standard dispute portal interface.
 *
 * Merlink is the primary dispute management platform for hospitality merchants,
 * offering full two-way sync capabilities:
 *   - Inbound: Receive dispute alerts, status updates, and evidence requests
 *   - Outbound: Submit evidence, push representment responses, sync case data
 *   - Portfolio management: Multi-property support for hotel groups
 *
 * Auth: API Key + API Secret + Merchant ID + Hotel ID
 * Request signing: HMAC-SHA256 on every outbound request
 * Base URL: https://api.merlink.com/v2 (configurable via MERLINK_API_URL env var)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// MERLINK STATUS MAPPINGS
// =============================================================================

// Merlink portal status -> AccuDefend internal status
const STATUS_MAP_FROM_MERLINK = {
  'new': 'PENDING',
  'pending_review': 'PENDING',
  'open': 'PENDING',
  'in_progress': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'evidence_gathering': 'IN_REVIEW',
  'submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'closed_won': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'closed_lost': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// AccuDefend internal status -> Merlink portal status
const STATUS_MAP_TO_MERLINK = {
  'PENDING': 'pending_review',
  'IN_REVIEW': 'in_progress',
  'SUBMITTED': 'submitted',
  'WON': 'won',
  'LOST': 'lost',
  'EXPIRED': 'expired'
};

// Merlink webhook event types that we subscribe to
const WEBHOOK_EVENTS = [
  'dispute.created',
  'dispute.updated',
  'dispute.closed',
  'evidence.requested',
  'response.submitted'
];


class MerlinkAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey      - Merlink API Key
   * @param {string} config.credentials.apiSecret   - Merlink API Secret (for HMAC signing)
   * @param {string} config.credentials.merchantId  - Merlink Merchant ID
   * @param {string} config.credentials.hotelId     - Merlink Hotel/Property ID
   * @param {string} [config.credentials.portfolioId] - Portfolio ID for multi-property
   * @param {boolean} [config.credentials.autoSubmit]  - Auto-submit evidence when ready
   * @param {string} [config.baseUrl]               - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'MERLINK',
      baseUrl: config.baseUrl || process.env.MERLINK_API_URL || 'https://api.merlink.com/v2'
    });

    this.merchantId = this.credentials.merchantId;
    this.hotelId = this.credentials.hotelId;
    this.apiSecret = this.credentials.apiSecret;
    this.portfolioId = this.credentials.portfolioId || null;
    this.autoSubmit = this.credentials.autoSubmit || false;

    // Initialize HTTP client with Merlink-specific auth headers
    this._initHttpClient({
      'X-API-Key': this.credentials.apiKey,
      'X-Merchant-ID': this.merchantId,
      'X-Hotel-ID': this.hotelId
    });

    // Add request signing interceptor (HMAC-SHA256 on every outbound request)
    this.httpClient.interceptors.request.use((requestConfig) => {
      const timestamp = Date.now().toString();
      const signature = this._signRequest(requestConfig.method, requestConfig.url, timestamp);
      requestConfig.headers['X-Timestamp'] = timestamp;
      requestConfig.headers['X-Signature'] = signature;
      return requestConfig;
    });
  }

  // ===========================================================================
  // INBOUND: Receive FROM Merlink
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from Merlink (via webhook or poll).
   */
  async receiveDispute(disputePayload) {
    logger.info(`[Merlink] Receiving dispute: ${disputePayload.disputeId || disputePayload.id}`);

    const normalized = this.normalizeDispute(disputePayload);

    logger.info(
      `[Merlink] Dispute normalized: ${normalized.disputeId} ` +
      `(${normalized.reasonCode} - $${normalized.amount})`
    );

    return normalized;
  }

  /**
   * Query Merlink for the current status of a dispute.
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/disputes/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.lastUpdated || data.updatedAt,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || data.resolvedAt || null,
      assignedTo: data.assignedTo || null
    };
  }

  /**
   * Retrieve evidence requirements for a Merlink dispute.
   */
  async getEvidenceRequirements(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/disputes/${disputeId}`)
    );

    const dispute = response.data;
    const requiredTypes = dispute.requiredEvidenceTypes || dispute.evidenceTypes || [];

    return {
      disputeId,
      requiredTypes,
      portalRequiredTypes: requiredTypes,
      recommendedTypes: this._getRecommendedEvidenceTypes(dispute.reasonCode),
      deadline: dispute.responseDeadline || dispute.dueDate,
      instructions: dispute.evidenceInstructions || this._getDefaultEvidenceInstructions(dispute.reasonCode),
      reasonCode: dispute.reasonCode,
      reasonCategory: dispute.reasonCategory || 'UNKNOWN'
    };
  }

  /**
   * Fetch a paginated list of disputes from Merlink.
   *
   * Supports filtering by status, date range, and property ID.
   */
  async fetchDisputes(params = {}) {
    const queryParams = {
      status: params.status || 'open',
      startDate: params.since || undefined,
      endDate: params.endDate || undefined,
      hotelId: params.hotelId || this.hotelId,
      limit: Math.min(params.limit || 100, 200),
      offset: params.page ? (params.page - 1) * (params.limit || 100) : (params.offset || 0)
    };

    // Remove undefined values
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/disputes', { params: queryParams })
    );

    const data = response.data;
    const disputes = data.data || data.disputes || [];

    return {
      disputes: disputes.map((d) => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.total || disputes.length,
      hasMore: data.hasMore || (disputes.length >= queryParams.limit),
      page: params.page || Math.floor(queryParams.offset / queryParams.limit) + 1
    };
  }

  /**
   * Fetch details of a single dispute by ID.
   */
  async getDispute(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/disputes/${disputeId}`)
    );

    return this.normalizeDispute(response.data);
  }

  // ===========================================================================
  // OUTBOUND: Send TO Merlink
  // ===========================================================================

  /**
   * Submit an evidence package to Merlink for a dispute.
   *
   * Merlink expects evidence with typed documents, descriptions, and optional
   * compelling evidence metadata specific to the hotel industry.
   */
  async submitEvidence(disputeId, evidencePackage) {
    const files = evidencePackage.files || [];
    const metadata = evidencePackage.metadata || {};

    // Support both new evidencePackage format and legacy format from disputeCompanies.js
    const isLegacyFormat = evidencePackage.type || evidencePackage.documents;

    let payload;

    if (isLegacyFormat) {
      // Legacy format from original MerlinkService
      payload = {
        evidenceType: evidencePackage.type,
        description: evidencePackage.description,
        documents: evidencePackage.documents,
        compellingEvidence: evidencePackage.compellingEvidence || {},
        metadata: evidencePackage.metadata
      };
    } else {
      // New standardized format
      payload = {
        disputeId,
        merchantId: this.merchantId,
        hotelId: this.hotelId,
        evidenceType: metadata.evidenceCategory || 'compelling_evidence',
        description: metadata.notes || '',
        documents: files.map((file, index) => ({
          documentType: file.type || 'supporting_document',
          fileName: file.fileName,
          mimeType: file.mimeType || 'application/pdf',
          data: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
          description: file.description || `Evidence document ${index + 1}`
        })),
        compellingEvidence: {
          guestName: metadata.guestName,
          confirmationNumber: metadata.confirmationNumber,
          checkInDate: metadata.checkInDate,
          checkOutDate: metadata.checkOutDate,
          transactionAmount: metadata.transactionAmount,
          transactionDate: metadata.transactionDate,
          transactionId: metadata.transactionId
        },
        metadata: {
          submittedBy: 'AccuDefend',
          autoSubmit: this.autoSubmit,
          propertyId: this.hotelId
        },
        idempotencyKey: this._generateIdempotencyKey('evidence')
      };
    }

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[Merlink] Evidence submitted for dispute ${disputeId}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Merlink for a dispute.
   *
   * This replaces the original MerlinkService.sendResponse() method,
   * preserving the representment package format that Merlink expects.
   */
  async pushResponse(disputeId, responseData) {
    // Support both new format and legacy format from sendResponse()
    const isLegacyFormat = responseData.reservationNumber || responseData.argument;

    let payload;

    if (isLegacyFormat) {
      // Legacy format from original MerlinkService.sendResponse()
      payload = {
        responseType: responseData.type || responseData.representmentType || 'representment',
        representmentPackage: {
          guestName: responseData.guestName,
          reservationNumber: responseData.reservationNumber,
          checkInDate: responseData.checkInDate,
          checkOutDate: responseData.checkOutDate,
          transactionAmount: responseData.amount,
          evidenceDocuments: responseData.evidenceIds,
          compellingArgument: responseData.argument
        },
        autoSubmit: responseData.autoSubmit || this.autoSubmit
      };
    } else {
      // New standardized format
      payload = {
        disputeId,
        merchantId: this.merchantId,
        hotelId: this.hotelId,
        responseType: responseData.representmentType || 'representment',
        representmentPackage: {
          guestName: responseData.guestDetails?.name,
          guestEmail: responseData.guestDetails?.email,
          guestPhone: responseData.guestDetails?.phone,
          loyaltyNumber: responseData.guestDetails?.loyaltyNumber || null,
          reservationNumber: responseData.stayDetails?.confirmationNumber,
          checkInDate: responseData.stayDetails?.checkInDate,
          checkOutDate: responseData.stayDetails?.checkOutDate,
          propertyName: responseData.stayDetails?.propertyName,
          roomType: responseData.stayDetails?.roomType,
          roomRate: responseData.stayDetails?.roomRate,
          totalCharges: responseData.stayDetails?.totalCharges,
          noShow: responseData.stayDetails?.noShow || false,
          earlyCheckout: responseData.stayDetails?.earlyCheckout || false,
          transactionAmount: responseData.stayDetails?.totalCharges,
          evidenceDocuments: responseData.evidenceIds || [],
          compellingArgument: responseData.compellingEvidence?.description || ''
        },
        compellingEvidence: {
          type: responseData.compellingEvidence?.type || 'generic',
          description: responseData.compellingEvidence?.description || '',
          priorTransactions: responseData.compellingEvidence?.priorTransactions || []
        },
        narrative: responseData.narrative || '',
        autoSubmit: responseData.autoSubmit || this.autoSubmit,
        idempotencyKey: this._generateIdempotencyKey('response')
      };
    }

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/response`, payload)
    );

    logger.info(`[Merlink] Response submitted for dispute ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a Merlink dispute (do not fight it).
   */
  async acceptDispute(disputeId) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      hotelId: this.hotelId,
      action: 'accept',
      notes: 'Liability accepted by merchant via AccuDefend',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/response`, payload)
    );

    logger.info(`[Merlink] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  /**
   * Update the status of a dispute case on Merlink.
   *
   * This replaces the original MerlinkService.updateCaseStatus() method.
   */
  async updateCaseStatus(disputeId, status, notes = '') {
    const merlinkStatus = STATUS_MAP_TO_MERLINK[status] || status;

    const response = await this._withRetry(() =>
      this.httpClient.patch(`/disputes/${disputeId}/status`, {
        status: merlinkStatus,
        notes,
        updatedAt: new Date().toISOString()
      })
    );

    logger.info(`[Merlink] Case ${disputeId} status updated to ${merlinkStatus}`);

    return {
      disputeId,
      status: merlinkStatus,
      message: response.data.message || 'Status updated',
      timestamp: new Date().toISOString()
    };
  }

  // ===========================================================================
  // CASE SYNC (preserved from original MerlinkService)
  // ===========================================================================

  /**
   * Sync case data bi-directionally between AccuDefend and Merlink.
   *
   * This is the original syncCase() logic from MerlinkService, preserved for
   * backward compatibility with DisputeCompanyService.
   *
   * @param {Object} localCase - The AccuDefend chargeback record
   * @param {string} [direction] - 'push', 'pull', or 'both' (default: 'both')
   * @returns {Promise<Object>}
   */
  async syncCase(localCase, direction = 'both') {
    try {
      if (direction === 'push' || direction === 'both') {
        // Push local data to Merlink
        await this._withRetry(() =>
          this.httpClient.put(`/disputes/${localCase.processorDisputeId}`, {
            externalCaseId: localCase.caseNumber,
            status: STATUS_MAP_TO_MERLINK[localCase.status] || 'pending_review',
            confidenceScore: localCase.confidenceScore,
            aiRecommendation: localCase.recommendation,
            lastUpdated: localCase.updatedAt
          })
        );

        logger.info(`[Merlink] Case ${localCase.caseNumber} pushed to Merlink`);
      }

      if (direction === 'pull' || direction === 'both') {
        // Pull Merlink data
        const dispute = await this.getDispute(localCase.processorDisputeId);
        logger.info(`[Merlink] Case ${localCase.caseNumber} pulled from Merlink`);
        return dispute;
      }

      return { success: true };
    } catch (error) {
      logger.error(`[Merlink] Failed to sync case ${localCase.caseNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync a case from Merlink's case-sync endpoint (bulk sync).
   *
   * @param {Object} caseData - Case data to sync
   * @returns {Promise<Object>}
   */
  async syncCaseData(caseData) {
    const payload = {
      merchantId: this.merchantId,
      hotelId: this.hotelId,
      caseData,
      syncTimestamp: new Date().toISOString()
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/cases/sync', payload)
    );

    logger.info(`[Merlink] Case sync completed via /cases/sync`);

    return {
      synced: response.data.synced || true,
      caseCount: response.data.caseCount || 1,
      message: response.data.message || 'Case sync completed'
    };
  }

  // ===========================================================================
  // PORTFOLIO MANAGEMENT
  // ===========================================================================

  /**
   * Retrieve portfolio-level dispute statistics from Merlink.
   *
   * Useful for hotel groups managing multiple properties. Returns aggregated
   * stats across all properties in the portfolio, or for a specific property.
   *
   * @param {Object} [params]
   * @param {string} [params.portfolioId] - Override default portfolio ID
   * @param {string} [params.hotelId] - Filter stats by a specific hotel
   * @param {string} [params.startDate] - Stats period start (ISO date)
   * @param {string} [params.endDate] - Stats period end (ISO date)
   * @returns {Promise<Object>} Portfolio stats
   */
  async getPortfolioStats(params = {}) {
    const queryParams = {
      portfolioId: params.portfolioId || this.portfolioId,
      hotelId: params.hotelId || undefined,
      startDate: params.startDate || undefined,
      endDate: params.endDate || undefined
    };

    // Remove undefined values
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/portfolio/stats', { params: queryParams })
    );

    const stats = response.data;

    return {
      portfolioId: stats.portfolioId || queryParams.portfolioId,
      period: {
        startDate: stats.startDate || queryParams.startDate,
        endDate: stats.endDate || queryParams.endDate
      },
      totalDisputes: stats.totalDisputes || 0,
      openDisputes: stats.openDisputes || 0,
      wonDisputes: stats.wonDisputes || 0,
      lostDisputes: stats.lostDisputes || 0,
      winRate: stats.winRate || 0,
      totalAmount: stats.totalAmount || 0,
      recoveredAmount: stats.recoveredAmount || 0,
      recoveryRate: stats.recoveryRate || 0,
      averageResolutionDays: stats.averageResolutionDays || 0,
      byProperty: stats.byProperty || [],
      byReasonCode: stats.byReasonCode || [],
      byMonth: stats.byMonth || []
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Merlink webhook payload.
   *
   * Merlink sends webhooks as JSON:
   *   { event: string, data: object, timestamp: string, disputeId: string }
   */
  parseWebhookPayload(rawPayload, headers) {
    let parsed;

    if (typeof rawPayload === 'string') {
      try {
        parsed = JSON.parse(rawPayload);
      } catch (err) {
        logger.error('[Merlink] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Merlink webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(rawPayload)) {
      try {
        parsed = JSON.parse(rawPayload.toString('utf-8'));
      } catch (err) {
        logger.error('[Merlink] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Merlink webhook payload: not valid JSON');
      }
    } else {
      parsed = rawPayload;
    }

    return {
      event: parsed.event || parsed.eventType,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-merlink-timestamp'] || new Date().toISOString(),
      disputeId: parsed.disputeId || parsed.data?.disputeId || null,
      webhookId: parsed.webhookId || headers['x-merlink-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Verify the signature of a Merlink webhook payload.
   *
   * Merlink signs webhooks using HMAC-SHA256 with the webhook secret.
   * The signature is sent in the X-Merlink-Signature header.
   *
   * This replaces the inline signature check in the original
   * disputeWebhookHandlers.merlink() function.
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    if (!signature || !secret) {
      logger.warn('[Merlink] Webhook signature verification skipped: missing signature or secret');
      return false;
    }

    const payload = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    return this._verifySignature(payload, signature, secret);
  }

  /**
   * Register a webhook callback URL with Merlink.
   *
   * Preserved from the original MerlinkService.registerWebhook() method.
   */
  async registerWebhook(callbackUrl, events = WEBHOOK_EVENTS) {
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      url: callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      merchantId: this.merchantId,
      hotelId: this.hotelId
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[Merlink] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: response.data.webhookId || response.data.id,
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      message: response.data.message || 'Webhook registered successfully'
    };
  }

  // ===========================================================================
  // NORMALIZATION
  // ===========================================================================

  /**
   * Normalize a Merlink dispute into AccuDefend's standard format.
   *
   * Merlink payloads include hospitality-specific fields like reservation
   * number, check-in/out dates, and property information.
   */
  normalizeDispute(portalData) {
    const id = portalData.disputeId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || 'USD',
      cardLastFour: portalData.cardLast4 || portalData.cardLastFour || portalData.maskedCardNumber?.slice(-4) || '',
      cardBrand: portalData.cardBrand || '',
      guestName: portalData.guestName || portalData.cardholderName || '',
      guestEmail: portalData.guestEmail || null,
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description || portalData.reasonDescription || '',
      disputeDate: portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      // Hospitality-specific fields from Merlink
      confirmationNumber: portalData.reservationNumber || portalData.confirmationNumber || null,
      checkInDate: portalData.checkInDate || null,
      checkOutDate: portalData.checkOutDate || null,
      propertyId: portalData.hotelId || portalData.propertyId || this.hotelId,
      propertyName: portalData.hotelName || portalData.propertyName || null,
      transactionId: portalData.transactionId || '',
      transactionDate: portalData.transactionDate || null,
      portalType: 'MERLINK',
      rawData: portalData
    };
  }

  /**
   * Map a Merlink status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_MERLINK[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object.
   *
   * Merlink disputes can come from either Visa or Mastercard networks,
   * so we handle both code formats. Merlink may also use its own internal
   * reason codes that don't directly map to card network codes.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();

    // Visa-style codes (XX.Y format)
    if (/^\d+\.\d+$/.test(normalized)) {
      if (normalized.startsWith('10.')) {
        return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
      }
      if (normalized.startsWith('11.')) {
        return { code: normalized, category: 'AUTHORIZATION', description: `Visa Authorization - Code ${normalized}` };
      }
      if (normalized.startsWith('12.')) {
        return { code: normalized, category: 'PROCESSING_ERROR', description: `Visa Processing Error - Code ${normalized}` };
      }
      if (normalized.startsWith('13.')) {
        return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
      }
    }

    // Mastercard-style codes (4-digit numbers in the 4800 range)
    const codeNum = parseInt(normalized, 10);
    if (codeNum >= 4800 && codeNum < 4900) {
      const mcDescriptions = {
        4837: 'No Cardholder Authorization',
        4853: 'Cardholder Dispute - Not as Described',
        4855: 'Goods or Services Not Provided',
        4860: 'Credit Not Processed',
        4863: 'Cardholder Does Not Recognize Transaction'
      };
      return {
        code: normalized,
        category: codeNum === 4837 ? 'FRAUD' : 'CONSUMER_DISPUTE',
        description: mcDescriptions[codeNum] || `Mastercard Dispute - Code ${normalized}`
      };
    }

    // Merlink internal or other codes
    return {
      code: normalized,
      category: 'UNKNOWN',
      description: portalCode
    };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify that we can communicate with the Merlink API.
   *
   * Replaces the original MerlinkService.testConnection() method.
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/ping', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Merlink API is reachable',
        details: {
          portalType: 'MERLINK',
          merchantId: this.merchantId,
          hotelId: this.hotelId,
          portfolioId: this.portfolioId,
          autoSubmit: this.autoSubmit,
          apiVersion: 'v2',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Merlink API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'MERLINK',
          merchantId: this.merchantId,
          hotelId: this.hotelId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }

  /**
   * Test connection to Merlink (backward-compatible alias for healthCheck).
   *
   * Returns the same shape as the original MerlinkService.testConnection().
   */
  async testConnection() {
    const health = await this.healthCheck();

    return {
      success: health.healthy,
      message: health.message,
      data: health.details
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Sign an outbound request with HMAC-SHA256.
   *
   * Preserved from the original MerlinkService.signRequest() method.
   * The signature covers: METHOD:PATH:TIMESTAMP:SECRET
   *
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - Request URL/path
   * @param {string} timestamp - Unix timestamp string
   * @returns {string} Hex-encoded HMAC-SHA256 signature
   */
  _signRequest(method, path, timestamp) {
    const payload = `${method.toUpperCase()}:${path}:${timestamp}:${this.apiSecret}`;
    return crypto.createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Get recommended evidence types based on the reason code category.
   *
   * For hotel chargebacks, the evidence types are tailored to hospitality
   * scenarios (folio, registration card, key card logs, etc.).
   */
  _getRecommendedEvidenceTypes(reasonCode) {
    if (!reasonCode) return [];

    const normalized = String(reasonCode).trim();

    // Fraud-related codes
    if (normalized.startsWith('10.') || normalized === '4837') {
      return [
        'signed_registration_card', 'id_verification', 'avs_cvv_match',
        'check_in_confirmation', 'key_card_access_log', 'surveillance'
      ];
    }

    // Service not received
    if (normalized === '13.1' || normalized === '4855') {
      return [
        'check_in_confirmation', 'folio', 'guest_registration_card',
        'key_card_access_log', 'id_verification', 'proof_of_delivery'
      ];
    }

    // Not as described
    if (normalized === '13.3' || normalized === '4853') {
      return [
        'booking_confirmation', 'folio', 'terms_accepted',
        'guest_correspondence', 'service_description'
      ];
    }

    // Credit not processed
    if (normalized === '13.6' || normalized === '4860') {
      return [
        'refund_policy', 'cancellation_policy', 'terms_and_conditions',
        'no_refund_entitlement', 'credit_issued_proof'
      ];
    }

    // Cancelled services
    if (normalized === '13.7') {
      return [
        'cancellation_policy', 'no_show_documentation', 'terms_accepted',
        'guest_folio', 'reservation_confirmation'
      ];
    }

    // Transaction not recognized
    if (normalized === '4863') {
      return [
        'booking_confirmation', 'signed_registration_card', 'folio',
        'merchant_descriptor_match', 'guest_correspondence'
      ];
    }

    // Default hotel evidence types
    return [
      'folio', 'guest_registration_card', 'booking_confirmation',
      'check_in_confirmation', 'guest_correspondence'
    ];
  }

  /**
   * Return default evidence instructions based on the reason code.
   */
  _getDefaultEvidenceInstructions(reasonCode) {
    if (!reasonCode) {
      return 'Submit all available hotel evidence: folio, signed registration card, ' +
             'booking confirmation, check-in/out records, and any guest correspondence.';
    }

    const normalized = String(reasonCode).trim();

    // Fraud
    if (normalized.startsWith('10.') || normalized === '4837') {
      return 'Provide evidence that the cardholder was present and authorized the charge: ' +
             'signed registration card, ID verification, check-in records, key card access logs, ' +
             'and AVS/CVV match confirmation.';
    }

    // Service not received
    if (normalized === '13.1' || normalized === '4855') {
      return 'Provide proof that the guest checked in and received hotel services: ' +
             'signed registration card, room folio, key card access logs, and check-in confirmation.';
    }

    // Not as described
    if (normalized === '13.3' || normalized === '4853') {
      return 'Provide evidence that the hotel services matched the booking description: ' +
             'booking confirmation with room details, guest folio, terms accepted at booking, ' +
             'and any guest correspondence.';
    }

    // Credit not processed
    if (normalized === '13.6' || normalized === '4860') {
      return 'Provide evidence that a refund is not owed or has already been issued: ' +
             'cancellation policy, refund terms accepted by the guest, or proof of credit processed.';
    }

    return 'Submit all available hotel evidence: folio, signed registration card, ' +
           'booking confirmation, check-in/out records, and any guest correspondence.';
  }
}

module.exports = MerlinkAdapter;
