/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Midigator (now part of Chargebacks911) Dispute Adapter
 *
 * Implements two-way integration with Midigator's intelligent chargeback
 * management platform:
 *   - Chargeback Lifecycle: Full dispute management from initial notification
 *     through representment to final outcome tracking.
 *   - Root Cause Analysis: Identifies the underlying cause of chargebacks
 *     (true fraud, friendly fraud, merchant error, authorization issues) to
 *     drive prevention strategies and improve win rates.
 *   - Prevention Alerts: Real-time alerts from card networks and issuers
 *     that arrive before formal chargebacks, enabling proactive resolution.
 *   - Intelligent Routing: Automatically routes disputes to the optimal
 *     response workflow based on reason code, amount, and win probability.
 *   - Auto-Representment: Template-driven response generation with
 *     evidence checklists tailored to specific reason codes and networks.
 *   - Merchant Descriptor Matching: Compares transaction descriptors
 *     against dispute data to identify recognition-related chargebacks.
 *
 * Auth: API Key sent in X-API-Key header.
 * Base URL: https://api.midigator.com/api/v1 (configurable)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// MIDIGATOR REASON CODE MAPPINGS
// =============================================================================

const MIDIGATOR_REASON_CODES = {
  'FRAUD_CNP': {
    code: 'FRAUD_CNP',
    category: 'FRAUD',
    description: 'Card-not-present fraud',
    compellingEvidenceTypes: ['avs_cvv_match', 'device_fingerprint', 'ip_address_match', 'prior_undisputed_transactions']
  },
  'FRAUD_CP': {
    code: 'FRAUD_CP',
    category: 'FRAUD',
    description: 'Card-present fraud',
    compellingEvidenceTypes: ['signed_receipt', 'chip_read_log', 'surveillance', 'id_verification']
  },
  'FRIENDLY_FRAUD': {
    code: 'FRIENDLY_FRAUD',
    category: 'FRAUD',
    description: 'Friendly fraud - legitimate cardholder files false dispute',
    compellingEvidenceTypes: ['proof_of_delivery', 'guest_registration', 'folio', 'guest_correspondence']
  },
  'UNRECOGNIZED': {
    code: 'UNRECOGNIZED',
    category: 'FRAUD',
    description: 'Cardholder does not recognize charge on statement',
    compellingEvidenceTypes: ['descriptor_match', 'booking_confirmation', 'guest_correspondence', 'folio']
  },
  'NOT_RECEIVED': {
    code: 'NOT_RECEIVED',
    category: 'CONSUMER_DISPUTE',
    description: 'Merchandise or services not received',
    compellingEvidenceTypes: ['check_in_confirmation', 'folio', 'guest_registration_card', 'key_card_logs']
  },
  'NOT_AS_DESCRIBED': {
    code: 'NOT_AS_DESCRIBED',
    category: 'CONSUMER_DISPUTE',
    description: 'Service not as described or defective',
    compellingEvidenceTypes: ['service_description', 'terms_accepted', 'guest_correspondence', 'quality_documentation']
  },
  'CREDIT_NOT_ISSUED': {
    code: 'CREDIT_NOT_ISSUED',
    category: 'CONSUMER_DISPUTE',
    description: 'Expected credit or refund not processed',
    compellingEvidenceTypes: ['refund_policy', 'terms_and_conditions', 'credit_issued_proof', 'no_refund_entitlement']
  },
  'CANCELLED': {
    code: 'CANCELLED',
    category: 'CONSUMER_DISPUTE',
    description: 'Cancelled reservation or service',
    compellingEvidenceTypes: ['cancellation_policy', 'no_show_documentation', 'reservation_confirmation', 'terms_accepted']
  },
  'DUPLICATE': {
    code: 'DUPLICATE',
    category: 'PROCESSING_ERROR',
    description: 'Duplicate or multiple charges for same transaction',
    compellingEvidenceTypes: ['transaction_records', 'folio', 'itemized_charges', 'separate_services_proof']
  },
  'INCORRECT_AMOUNT': {
    code: 'INCORRECT_AMOUNT',
    category: 'PROCESSING_ERROR',
    description: 'Charged amount differs from authorized amount',
    compellingEvidenceTypes: ['signed_receipt', 'folio', 'booking_confirmation', 'authorization_log']
  },
  'AUTH_NOT_OBTAINED': {
    code: 'AUTH_NOT_OBTAINED',
    category: 'AUTHORIZATION',
    description: 'Authorization not obtained or declined authorization used',
    compellingEvidenceTypes: ['authorization_log', 'approval_code', 'transaction_receipt']
  },
  'RECURRING_CANCELLED': {
    code: 'RECURRING_CANCELLED',
    category: 'CONSUMER_DISPUTE',
    description: 'Recurring charge after cancellation request',
    compellingEvidenceTypes: ['terms_and_conditions', 'cancellation_policy', 'signed_agreement', 'cancellation_records']
  }
};

// Midigator portal status -> AccuDefend internal status
const STATUS_MAP_FROM_MIDIGATOR = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'assigned': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'in_progress': 'IN_REVIEW',
  'investigating': 'IN_REVIEW',
  'documents_submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'awaiting_outcome': 'SUBMITTED',
  'won': 'WON',
  'reversed': 'WON',
  'merchant_won': 'WON',
  'lost': 'LOST',
  'upheld': 'LOST',
  'merchant_lost': 'LOST',
  'accepted': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'resolved': 'RESOLVED'
};

// AccuDefend status -> Midigator portal status
const STATUS_MAP_TO_MIDIGATOR = {
  'PENDING': 'open',
  'IN_REVIEW': 'under_review',
  'SUBMITTED': 'responded',
  'WON': 'won',
  'LOST': 'lost',
  'EXPIRED': 'expired'
};

// Root cause categories used by Midigator
const ROOT_CAUSES = {
  TRUE_FRAUD: 'true_fraud',
  FRIENDLY_FRAUD: 'friendly_fraud',
  MERCHANT_ERROR: 'merchant_error',
  AUTHORIZATION_ERROR: 'authorization_error',
  PROCESSING_ERROR: 'processing_error',
  POLICY_DISPUTE: 'policy_dispute',
  UNRECOGNIZED_CHARGE: 'unrecognized_charge'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'chargeback.created',
  'chargeback.updated',
  'chargeback.resolved',
  'chargeback.escalated',
  'alert.created',
  'alert.resolved',
  'alert.expired',
  'evidence.requested',
  'representment.outcome',
  'root_cause.analyzed'
];


class MidigatorAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey         - Midigator API Key
   * @param {string} [config.credentials.merchantId]   - Merchant identifier
   * @param {string} [config.credentials.webhookSecret] - Shared webhook secret
   * @param {string} [config.credentials.descriptor]   - Primary merchant descriptor
   * @param {boolean} [config.credentials.autoRouting]  - Intelligent routing enabled
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'MIDIGATOR',
      baseUrl: config.baseUrl || process.env.MIDIGATOR_API_URL || 'https://api.midigator.com/api/v1'
    });

    this.merchantId = this.credentials.merchantId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.descriptor = this.credentials.descriptor || '';
    this.autoRouting = this.credentials.autoRouting || false;

    // Initialize HTTP client with Midigator API Key auth
    this._initHttpClient({
      'X-API-Key': this.credentials.apiKey,
      'X-Merchant-ID': this.merchantId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with the Midigator API and verify credentials.
   *
   * @returns {Promise<Object>} { authenticated, merchantId, features }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/auth/verify')
      );

      const data = response.data;
      logger.info(`[Midigator] Authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: data.merchantId || this.merchantId,
        merchantName: data.merchantName || '',
        features: data.features || [],
        autoRouting: data.autoRouting || this.autoRouting,
        expiresAt: data.tokenExpiry || null
      };
    } catch (error) {
      logger.error(`[Midigator] Authentication failed: ${this._extractErrorMessage(error)}`);
      return {
        authenticated: false,
        merchantId: this.merchantId,
        error: this._extractErrorMessage(error)
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Midigator
  // ===========================================================================

  /**
   * Receive and normalize a chargeback payload pushed from Midigator.
   * Handles both prevention alerts and formal chargeback notifications.
   *
   * @param {Object} disputeData - Raw chargeback/alert data from Midigator
   * @returns {Promise<Object>} Normalized dispute object in AccuDefend format
   */
  async receiveDispute(disputeData) {
    logger.info(`[Midigator] Receiving chargeback: ${disputeData.chargebackId || disputeData.alertId || disputeData.id}`);

    // Trigger root cause analysis if not already present
    if (!disputeData.rootCause && disputeData.chargebackId) {
      try {
        const rootCause = await this.getRootCauseAnalysis(disputeData.chargebackId);
        disputeData._rootCauseEnriched = true;
        disputeData.rootCause = rootCause.rootCause;
        disputeData.rootCauseConfidence = rootCause.confidence;
      } catch (err) {
        logger.warn(`[Midigator] Could not enrich with root cause analysis: ${err.message}`);
      }
    }

    const normalized = this.normalizeDispute(disputeData);
    logger.info(`[Midigator] Chargeback normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Query Midigator for the current status of a chargeback.
   *
   * @param {string} disputeId - Midigator chargeback identifier
   * @returns {Promise<Object>} Chargeback status details
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/chargebacks/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.updatedAt || data.lastModified,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      rootCause: data.rootCause || null,
      routedTo: data.routedTo || null,
      winProbability: data.winProbability || null
    };
  }

  /**
   * Fetch a paginated list of chargebacks from Midigator.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore, page }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || undefined,
      rootCause: params.rootCause || undefined,
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100),
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc'
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/chargebacks', { params: queryParams })
    );

    const data = response.data;
    const chargebacks = data.chargebacks || data.data || [];

    return {
      disputes: chargebacks.map(cb => this.normalizeDispute(cb)),
      totalCount: data.totalCount || data.total || chargebacks.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // OUTBOUND: Send TO Midigator
  // ===========================================================================

  /**
   * Submit evidence documents to Midigator for a chargeback.
   *
   * @param {string} disputeId - Midigator chargeback identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message, timestamp }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      evidenceCategory: metadata.evidenceCategory || 'compelling_evidence',
      documents: files.map((file, index) => ({
        documentType: file.type || 'supporting_document',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        data: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`
      })),
      transactionDetails: {
        guestName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        merchantDescriptor: metadata.merchantDescriptor || this.descriptor
      },
      representmentNarrative: metadata.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/documents`, payload)
    );

    logger.info(`[Midigator] Evidence submitted for chargeback ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Midigator for a chargeback.
   *
   * @param {string} disputeId - Midigator chargeback identifier
   * @param {Object} responseData - Response with evidence and details
   * @returns {Promise<Object>} { responseId, status, message, timestamp }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      responseType: responseData.representmentType || 'representment',
      rootCause: responseData.rootCause || null,
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceInfo: responseData.compellingEvidence?.deviceInfo || null,
        descriptorMatch: responseData.compellingEvidence?.descriptorMatch || null
      },
      guestDetails: {
        name: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        loyaltyNumber: responseData.guestDetails?.loyaltyNumber || null
      },
      stayDetails: {
        propertyName: responseData.stayDetails?.propertyName,
        confirmationNumber: responseData.stayDetails?.confirmationNumber,
        checkInDate: responseData.stayDetails?.checkInDate,
        checkOutDate: responseData.stayDetails?.checkOutDate,
        roomType: responseData.stayDetails?.roomType,
        roomRate: responseData.stayDetails?.roomRate,
        totalCharges: responseData.stayDetails?.totalCharges,
        noShow: responseData.stayDetails?.noShow || false,
        earlyCheckout: responseData.stayDetails?.earlyCheckout || false
      },
      evidenceIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/respond`, payload)
    );

    logger.info(`[Midigator] Response submitted for chargeback ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a chargeback (do not fight it).
   *
   * @param {string} disputeId - Midigator chargeback identifier
   * @returns {Promise<Object>} { accepted, disputeId, responseId, message }
   */
  async acceptDispute(disputeId) {
    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      action: 'accept_liability',
      reason: 'Merchant accepts liability',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/respond`, payload)
    );

    logger.info(`[Midigator] Chargeback ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Chargeback accepted'
    };
  }

  // ===========================================================================
  // ROOT CAUSE ANALYSIS
  // ===========================================================================

  /**
   * Retrieve root cause analysis for a chargeback. Midigator classifies
   * the underlying reason a chargeback occurred, enabling targeted prevention.
   *
   * @param {string} chargebackId - Midigator chargeback identifier
   * @returns {Promise<Object>} Root cause analysis with confidence and factors
   */
  async getRootCauseAnalysis(chargebackId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/chargebacks/${chargebackId}/root-cause`)
    );

    const data = response.data;

    return {
      chargebackId,
      rootCause: data.rootCause || 'unknown',
      confidence: data.confidence || 0,
      factors: data.factors || [],
      subCategory: data.subCategory || null,
      preventionRecommendations: data.preventionRecommendations || [],
      descriptorAnalysis: data.descriptorAnalysis || null,
      historicalPattern: data.historicalPattern || null,
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // PREVENTION ALERTS
  // ===========================================================================

  /**
   * Fetch pending prevention alerts from Midigator.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { alerts: [], totalCount, hasMore }
   */
  async fetchAlerts(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || 'pending',
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/prevention/alerts', { params: queryParams })
    );

    const data = response.data;
    const alerts = data.alerts || data.data || [];

    return {
      alerts: alerts.map(a => this.normalizeDispute(a)),
      totalCount: data.totalCount || data.total || alerts.length,
      hasMore: data.hasMore || false,
      page: data.page || queryParams.page
    };
  }

  /**
   * Respond to a prevention alert to resolve it before chargeback escalation.
   *
   * @param {string} alertId - Midigator alert identifier
   * @param {Object} resolution
   * @param {string} resolution.action - 'refund', 'credit', 'resolve', or 'dispute'
   * @param {number} [resolution.refundAmount] - Amount to refund if applicable
   * @param {string} [resolution.notes] - Resolution notes
   * @returns {Promise<Object>} { alertId, resolved, action, message }
   */
  async resolveAlert(alertId, resolution) {
    const payload = {
      alertId,
      merchantId: this.merchantId,
      action: resolution.action,
      refundAmount: resolution.refundAmount || null,
      notes: resolution.notes || '',
      idempotencyKey: this._generateIdempotencyKey('alert_resolve')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/prevention/alerts/${alertId}/resolve`, payload)
    );

    logger.info(`[Midigator] Alert ${alertId} resolved with action: ${resolution.action}`);

    return {
      alertId,
      resolved: response.data.resolved !== false,
      action: resolution.action,
      message: response.data.message || 'Alert resolved',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // INTELLIGENT ROUTING
  // ===========================================================================

  /**
   * Get the intelligent routing recommendation for a chargeback.
   * Midigator analyzes the reason code, amount, card network, and historical
   * win rates to recommend the optimal response workflow.
   *
   * @param {string} chargebackId - Midigator chargeback identifier
   * @returns {Promise<Object>} Routing recommendation
   */
  async getRoutingRecommendation(chargebackId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/chargebacks/${chargebackId}/routing`)
    );

    const data = response.data;

    return {
      chargebackId,
      recommendedAction: data.recommendedAction || 'manual_review',
      winProbability: data.winProbability || 0,
      routingFactors: data.routingFactors || [],
      suggestedWorkflow: data.suggestedWorkflow || null,
      autoRepresentmentEligible: data.autoRepresentmentEligible || false,
      estimatedRecovery: data.estimatedRecovery || 0,
      responseDeadline: data.responseDeadline || null,
      priorityLevel: data.priorityLevel || 'normal'
    };
  }

  // ===========================================================================
  // ANALYTICS AND WIN RATE TRACKING
  // ===========================================================================

  /**
   * Fetch comprehensive analytics from Midigator with root cause breakdown,
   * win rates, and prevention metrics.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date (ISO format)
   * @param {string} params.endDate - End date (ISO format)
   * @param {string} [params.groupBy] - 'day', 'week', or 'month'
   * @returns {Promise<Object>} Analytics data
   */
  async getAnalytics(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          groupBy: params.groupBy || 'month',
          merchantId: this.merchantId
        }
      })
    );

    const data = response.data;

    return {
      summary: {
        totalChargebacks: data.totalChargebacks || 0,
        totalRecovered: data.totalRecovered || 0,
        totalLost: data.totalLost || 0,
        winRate: data.winRate || 0,
        avgRecoveryAmount: data.avgRecoveryAmount || 0,
        avgResponseTime: data.avgResponseTime || 0,
        preventionRate: data.preventionRate || 0,
        alertsResolved: data.alertsResolved || 0
      },
      rootCauseBreakdown: data.rootCauseBreakdown || [],
      reasonCodeBreakdown: data.reasonCodeBreakdown || [],
      monthlyTrend: data.monthlyTrend || [],
      routingEfficiency: {
        autoRepresentmentRate: data.routingEfficiency?.autoRepresentmentRate || 0,
        avgTimeToRespond: data.routingEfficiency?.avgTimeToRespond || 0,
        routingAccuracy: data.routingEfficiency?.routingAccuracy || 0
      },
      descriptorIssues: data.descriptorIssues || [],
      period: { startDate: params.startDate, endDate: params.endDate }
    };
  }

  /**
   * Get win rate statistics segmented by root cause category.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date
   * @param {string} params.endDate - End date
   * @returns {Promise<Object>} Win rates by root cause
   */
  async getWinRatesByRootCause(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics/win-rates', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          merchantId: this.merchantId,
          groupBy: 'rootCause'
        }
      })
    );

    return {
      winRates: response.data.winRates || response.data.data || [],
      overallWinRate: response.data.overallWinRate || 0,
      period: { startDate: params.startDate, endDate: params.endDate }
    };
  }

  // ===========================================================================
  // AUTO-REPRESENTMENT TEMPLATES
  // ===========================================================================

  /**
   * Generate an auto-representment template using Midigator's intelligent
   * template engine. Templates are optimized based on reason code, card
   * network, root cause, and historical win data.
   *
   * @param {string} disputeId - Midigator chargeback identifier
   * @param {Object} [context] - Additional context for template generation
   * @returns {Promise<Object>} Template with evidence checklist and win probability
   */
  async generateRepresentmentTemplate(disputeId, context = {}) {
    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      additionalContext: {
        guestName: context.guestName || null,
        confirmationNumber: context.confirmationNumber || null,
        stayDetails: context.stayDetails || null,
        availableEvidence: context.availableEvidence || [],
        rootCause: context.rootCause || null
      }
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/auto-template`, payload)
    );

    const data = response.data;

    return {
      template: data.template || null,
      requiredFields: data.requiredFields || [],
      optionalFields: data.optionalFields || [],
      winProbability: data.winProbability || 0,
      narrative: data.narrative || '',
      evidenceChecklist: data.evidenceChecklist || [],
      rootCauseGuidance: data.rootCauseGuidance || '',
      reasonCodeGuidance: data.reasonCodeGuidance || '',
      networkSpecificNotes: data.networkSpecificNotes || ''
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Midigator webhook payload into a structured event object.
   *
   * @param {Object} headers - Request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} { event, data, timestamp, webhookId, rawData }
   */
  parseWebhookPayload(headers, body) {
    let parsed;

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[Midigator] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Midigator webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Midigator] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Midigator webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature if secret is configured
    const signature = headers['x-midigator-signature'] || headers['x-midigator-hmac'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Midigator] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.event || parsed.eventType,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-midigator-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-midigator-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Midigator.
   *
   * @param {Object} config
   * @param {string} config.callbackUrl - Endpoint URL for Midigator to POST to
   * @param {string[]} [config.events] - Event types to subscribe to
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      callbackUrl: config.callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      version: 'v1'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[Midigator] Webhook registered: ${config.callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: response.data.webhookId || response.data.id,
      callbackUrl: config.callbackUrl,
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
   * Normalize a Midigator chargeback/alert into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw chargeback or alert data from Midigator
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.chargebackId || portalData.alertId || portalData.disputeId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || 0);
    const reasonCode = portalData.reasonCode || portalData.chargebackReason || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedCard?.slice(-4) || '',
      cardBrand: portalData.cardBrand || portalData.cardNetwork || 'UNKNOWN',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.alertDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      alertType: portalData.alertType || (portalData.alertId ? 'PREVENTION' : 'CHARGEBACK'),
      isPreChargeback: !!portalData.alertId || portalData.alertType === 'prevention',
      rootCause: portalData.rootCause || null,
      rootCauseConfidence: portalData.rootCauseConfidence || null,
      winProbability: portalData.winProbability || null,
      routedTo: portalData.routedTo || null,
      transactionId: portalData.transactionId || portalData.acquirerRefNum || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'MIDIGATOR',
      rawData: portalData
    };
  }

  /**
   * Map a Midigator status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Status value from Midigator
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_MIDIGATOR[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Midigator reason code to a structured object.
   *
   * @param {string} portalCode - Reason code from Midigator
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase().replace(/\s+/g, '_');
    const known = MIDIGATOR_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    const upper = normalized.toUpperCase();
    if (upper.includes('FRAUD') || upper.includes('UNAUTHORIZED') || upper.includes('UNRECOGNIZED')) {
      return { code: normalized, category: 'FRAUD', description: `Fraud - ${portalCode}` };
    }
    if (upper.includes('SERVICE') || upper.includes('CANCEL') || upper.includes('CREDIT') || upper.includes('RECEIVED')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Consumer Dispute - ${portalCode}` };
    }
    if (upper.includes('DUPLICATE') || upper.includes('AMOUNT') || upper.includes('PROCESSING')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Processing Error - ${portalCode}` };
    }
    if (upper.includes('AUTH')) {
      return { code: normalized, category: 'AUTHORIZATION', description: `Authorization - ${portalCode}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Midigator Code: ${portalCode}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Midigator API.
   *
   * @returns {Promise<Object>} { healthy, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Midigator API is reachable',
        details: {
          portalType: 'MIDIGATOR',
          merchantId: this.merchantId,
          autoRouting: this.autoRouting,
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Midigator API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'MIDIGATOR',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = MidigatorAdapter;
