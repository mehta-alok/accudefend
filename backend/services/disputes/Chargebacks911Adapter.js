/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Chargebacks911 Dispute Adapter
 *
 * Implements two-way integration with Chargebacks911's chargeback management platform:
 *   - Prevention Alerts: Real-time alerts when a dispute is initiated, allowing
 *     merchants to resolve before it becomes a formal chargeback.
 *   - Representment: Full dispute response workflow with intelligent evidence
 *     packaging and reason code analysis.
 *   - Intelligent Source Detection (ISD): Identifies the root cause of chargebacks
 *     (true fraud, friendly fraud, merchant error) to inform response strategy.
 *   - Merchant Descriptor Analysis: Matches transaction descriptors to prevent
 *     "unrecognized charge" disputes.
 *   - ROI Tracking: Comprehensive analytics on win rates, recovery amounts,
 *     and cost-per-dispute metrics.
 *
 * Auth: API Key + Client ID sent in request headers.
 * Base URL: https://api.chargebacks911.com/api/v2 (configurable)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// CHARGEBACKS911 REASON CODE MAPPINGS (network-agnostic)
// =============================================================================

const CB911_REASON_CODES = {
  'FRAUD_CARD_PRESENT': {
    code: 'FRAUD_CARD_PRESENT',
    category: 'FRAUD',
    description: 'Fraudulent transaction in card-present environment',
    compellingEvidenceTypes: ['signed_receipt', 'chip_read_log', 'surveillance', 'id_verification']
  },
  'FRAUD_CARD_NOT_PRESENT': {
    code: 'FRAUD_CARD_NOT_PRESENT',
    category: 'FRAUD',
    description: 'Fraudulent transaction in card-not-present environment',
    compellingEvidenceTypes: ['avs_cvv_match', 'device_fingerprint', 'ip_address_match', 'prior_undisputed_transactions']
  },
  'FRIENDLY_FRAUD': {
    code: 'FRIENDLY_FRAUD',
    category: 'FRAUD',
    description: 'Friendly fraud - cardholder received goods/services but disputes',
    compellingEvidenceTypes: ['proof_of_delivery', 'signed_registration', 'folio', 'guest_correspondence']
  },
  'SERVICE_NOT_RECEIVED': {
    code: 'SERVICE_NOT_RECEIVED',
    category: 'CONSUMER_DISPUTE',
    description: 'Cardholder claims service was not received',
    compellingEvidenceTypes: ['check_in_confirmation', 'folio', 'key_card_logs', 'guest_registration_card']
  },
  'SERVICE_NOT_AS_DESCRIBED': {
    code: 'SERVICE_NOT_AS_DESCRIBED',
    category: 'CONSUMER_DISPUTE',
    description: 'Service not as described or defective',
    compellingEvidenceTypes: ['service_description', 'terms_accepted', 'guest_correspondence', 'quality_documentation']
  },
  'CREDIT_NOT_PROCESSED': {
    code: 'CREDIT_NOT_PROCESSED',
    category: 'CONSUMER_DISPUTE',
    description: 'Expected credit/refund was not processed',
    compellingEvidenceTypes: ['refund_policy', 'terms_and_conditions', 'credit_issued_proof']
  },
  'CANCELLED_RECURRING': {
    code: 'CANCELLED_RECURRING',
    category: 'CONSUMER_DISPUTE',
    description: 'Recurring transaction after cancellation',
    compellingEvidenceTypes: ['terms_and_conditions', 'cancellation_policy', 'signed_agreement']
  },
  'CANCELLED_RESERVATION': {
    code: 'CANCELLED_RESERVATION',
    category: 'CONSUMER_DISPUTE',
    description: 'Cancelled reservation or no-show dispute',
    compellingEvidenceTypes: ['cancellation_policy', 'no_show_documentation', 'reservation_confirmation', 'terms_accepted']
  },
  'DUPLICATE_CHARGE': {
    code: 'DUPLICATE_CHARGE',
    category: 'PROCESSING_ERROR',
    description: 'Duplicate or multiple charges for same service',
    compellingEvidenceTypes: ['transaction_records', 'folio', 'itemized_charges']
  },
  'INCORRECT_AMOUNT': {
    code: 'INCORRECT_AMOUNT',
    category: 'PROCESSING_ERROR',
    description: 'Charged amount differs from agreed amount',
    compellingEvidenceTypes: ['signed_receipt', 'folio', 'booking_confirmation', 'terms_accepted']
  },
  'UNRECOGNIZED_CHARGE': {
    code: 'UNRECOGNIZED_CHARGE',
    category: 'FRAUD',
    description: 'Cardholder does not recognize the charge on statement',
    compellingEvidenceTypes: ['descriptor_match', 'booking_confirmation', 'guest_correspondence']
  }
};

// CB911 portal status -> AccuDefend internal status
const STATUS_MAP_FROM_CB911 = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending_review': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'in_progress': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'won': 'WON',
  'reversed': 'WON',
  'merchant_won': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'accepted': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// AccuDefend status -> CB911 portal status
const STATUS_MAP_TO_CB911 = {
  'PENDING': 'open',
  'IN_REVIEW': 'under_review',
  'SUBMITTED': 'responded',
  'WON': 'won',
  'LOST': 'lost',
  'EXPIRED': 'expired'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'alert.created',
  'alert.updated',
  'alert.expired',
  'dispute.created',
  'dispute.updated',
  'dispute.resolved',
  'dispute.escalated',
  'evidence.requested',
  'representment.outcome'
];


class Chargebacks911Adapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey    - Chargebacks911 API Key
   * @param {string} config.credentials.clientId  - Client ID assigned by CB911
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.credentials.descriptor]    - Primary merchant descriptor
   * @param {boolean} [config.credentials.isdEnabled]    - Intelligent Source Detection enabled
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'CHARGEBACKS911',
      baseUrl: config.baseUrl || process.env.CB911_API_URL || 'https://api.chargebacks911.com/api/v2'
    });

    this.clientId = this.credentials.clientId;
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.descriptor = this.credentials.descriptor || '';
    this.isdEnabled = this.credentials.isdEnabled || false;

    // Initialize HTTP client with CB911 auth headers
    this._initHttpClient({
      'X-API-Key': this.credentials.apiKey,
      'X-Client-ID': this.clientId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with the Chargebacks911 API and verify credentials.
   * CB911 uses API Key + Client ID header-based authentication.
   *
   * @returns {Promise<Object>} { authenticated: boolean, clientId, merchantName, features }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/auth/verify')
      );

      const data = response.data;
      logger.info(`[CB911] Authentication successful for client ${this.clientId}`);

      return {
        authenticated: true,
        clientId: data.clientId || this.clientId,
        merchantName: data.merchantName || '',
        features: data.features || [],
        isdEnabled: data.isdEnabled || this.isdEnabled,
        expiresAt: data.tokenExpiry || null
      };
    } catch (error) {
      logger.error(`[CB911] Authentication failed: ${this._extractErrorMessage(error)}`);
      return {
        authenticated: false,
        clientId: this.clientId,
        error: this._extractErrorMessage(error)
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Chargebacks911
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from Chargebacks911.
   * Handles both prevention alerts and formal dispute notifications.
   *
   * @param {Object} disputeData - Raw dispute/alert data from CB911
   * @returns {Promise<Object>} Normalized dispute object in AccuDefend format
   */
  async receiveDispute(disputeData) {
    logger.info(`[CB911] Receiving dispute: ${disputeData.disputeId || disputeData.alertId || disputeData.id}`);

    // If ISD data is present, enrich the dispute with source detection
    if (this.isdEnabled && disputeData.isdClassification) {
      disputeData._isdEnriched = true;
    }

    const normalized = this.normalizeDispute(disputeData);
    logger.info(`[CB911] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Query Chargebacks911 for the current status of a dispute.
   *
   * @param {string} disputeId - CB911 dispute identifier
   * @returns {Promise<Object>} { disputeId, status, portalStatus, lastUpdated, notes, outcome }
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
      lastUpdated: data.updatedAt || data.lastModified,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      isdClassification: data.isdClassification || null,
      winProbability: data.winProbability || null
    };
  }

  /**
   * Fetch a paginated list of disputes from Chargebacks911.
   *
   * @param {Object} params - Query parameters
   * @param {string} [params.since] - ISO date string; only disputes after this date
   * @param {string} [params.status] - Filter by status
   * @param {number} [params.page] - Page number (1-based)
   * @param {number} [params.limit] - Results per page (max 100)
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore, page }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || undefined,
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100),
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc'
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/disputes', { params: queryParams })
    );

    const data = response.data;
    const disputes = data.disputes || data.data || [];

    return {
      disputes: disputes.map(d => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.total || disputes.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // OUTBOUND: Send TO Chargebacks911
  // ===========================================================================

  /**
   * Submit an evidence package to Chargebacks911 for a dispute.
   *
   * @param {string} disputeId - CB911 dispute identifier
   * @param {Object} evidence - Evidence package
   * @param {Array} evidence.files - [{ type, fileName, mimeType, data }]
   * @param {Object} evidence.metadata - Transaction and guest details
   * @returns {Promise<Object>} { submissionId, status, message, timestamp }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      disputeId,
      clientId: this.clientId,
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
      autoTemplate: metadata.autoTemplate || false,
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[CB911] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Chargebacks911 for a dispute.
   *
   * @param {string} disputeId - CB911 dispute identifier
   * @param {Object} response - Response data with evidence and details
   * @returns {Promise<Object>} { responseId, status, message, timestamp }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      disputeId,
      clientId: this.clientId,
      responseType: responseData.representmentType || 'representment',
      isdClassification: responseData.isdClassification || null,
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
      this.httpClient.post(`/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[CB911] Response submitted for dispute ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a dispute (do not fight it).
   *
   * @param {string} disputeId - CB911 dispute identifier
   * @returns {Promise<Object>} { accepted, disputeId, responseId, message }
   */
  async acceptDispute(disputeId) {
    const payload = {
      disputeId,
      clientId: this.clientId,
      action: 'accept_liability',
      reason: 'Merchant accepts liability',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[CB911] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  // ===========================================================================
  // PREVENTION ALERTS
  // ===========================================================================

  /**
   * Fetch pending prevention alerts from Chargebacks911.
   * Alerts arrive before a formal chargeback is filed, giving merchants
   * an opportunity to resolve or issue a refund proactively.
   *
   * @param {Object} params - Query parameters
   * @param {string} [params.since] - Only alerts after this ISO date
   * @param {string} [params.status] - Alert status filter
   * @param {number} [params.page] - Page number
   * @param {number} [params.limit] - Results per page
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
      this.httpClient.get('/alerts', { params: queryParams })
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
   * Respond to a prevention alert before it escalates to a chargeback.
   *
   * @param {string} alertId - CB911 alert identifier
   * @param {Object} resolution
   * @param {string} resolution.action - 'refund', 'credit', 'resolve', or 'dispute'
   * @param {number} [resolution.refundAmount] - Amount to refund (if action is refund/credit)
   * @param {string} [resolution.notes] - Resolution notes
   * @returns {Promise<Object>} { alertId, resolved, action, message }
   */
  async resolveAlert(alertId, resolution) {
    const payload = {
      alertId,
      clientId: this.clientId,
      action: resolution.action,
      refundAmount: resolution.refundAmount || null,
      notes: resolution.notes || '',
      idempotencyKey: this._generateIdempotencyKey('alert_resolve')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/alerts/${alertId}/resolve`, payload)
    );

    logger.info(`[CB911] Alert ${alertId} resolved with action: ${resolution.action}`);

    return {
      alertId,
      resolved: response.data.resolved !== false,
      action: resolution.action,
      message: response.data.message || 'Alert resolved',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // INTELLIGENT SOURCE DETECTION (ISD)
  // ===========================================================================

  /**
   * Run Intelligent Source Detection on a dispute to classify its root cause.
   * ISD analyzes transaction data, cardholder behavior, and dispute patterns
   * to determine if a chargeback is true fraud, friendly fraud, or merchant error.
   *
   * @param {string} disputeId - CB911 dispute identifier
   * @returns {Promise<Object>} { disputeId, classification, confidence, factors, recommendation }
   */
  async classifyDisputeSource(disputeId) {
    if (!this.isdEnabled) {
      logger.warn('[CB911] Intelligent Source Detection is not enabled');
      return {
        disputeId,
        classification: 'UNKNOWN',
        confidence: 0,
        message: 'ISD is not enabled. Enable it in integration settings.'
      };
    }

    const response = await this._withRetry(() =>
      this.httpClient.get(`/disputes/${disputeId}/isd-analysis`)
    );

    const data = response.data;

    logger.info(`[CB911] ISD classification for ${disputeId}: ${data.classification} (${data.confidence}%)`);

    return {
      disputeId,
      classification: data.classification || 'UNKNOWN',
      confidence: data.confidence || 0,
      factors: data.factors || [],
      recommendation: data.recommendation || null,
      descriptorMatch: data.descriptorMatch || null,
      fraudScore: data.fraudScore || null,
      friendlyFraudIndicators: data.friendlyFraudIndicators || []
    };
  }

  /**
   * Analyze a merchant descriptor to check for potential recognition issues.
   * Helps prevent "unrecognized charge" disputes by identifying descriptors
   * that may confuse cardholders.
   *
   * @param {string} descriptor - Merchant descriptor to analyze
   * @returns {Promise<Object>} { descriptor, score, issues, recommendations }
   */
  async analyzeDescriptor(descriptor) {
    const response = await this._withRetry(() =>
      this.httpClient.post('/analytics/descriptor-analysis', {
        clientId: this.clientId,
        descriptor: descriptor || this.descriptor
      })
    );

    const data = response.data;

    return {
      descriptor: data.descriptor || descriptor,
      recognitionScore: data.recognitionScore || 0,
      issues: data.issues || [],
      recommendations: data.recommendations || [],
      similarDescriptors: data.similarDescriptors || []
    };
  }

  // ===========================================================================
  // ANALYTICS AND WIN RATE TRACKING
  // ===========================================================================

  /**
   * Fetch comprehensive analytics from Chargebacks911 including win rates,
   * recovery amounts, reason code distribution, and ROI metrics.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date (ISO format)
   * @param {string} params.endDate - End date (ISO format)
   * @param {string} [params.groupBy] - Group results by 'day', 'week', 'month'
   * @returns {Promise<Object>} Analytics data with win rates, recovery, and ROI
   */
  async getAnalytics(params = {}) {
    const queryParams = {
      startDate: params.startDate,
      endDate: params.endDate,
      groupBy: params.groupBy || 'month',
      clientId: this.clientId
    };

    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics', { params: queryParams })
    );

    const data = response.data;

    return {
      summary: {
        totalDisputes: data.totalDisputes || 0,
        totalRecovered: data.totalRecovered || 0,
        totalLost: data.totalLost || 0,
        winRate: data.winRate || 0,
        avgRecoveryAmount: data.avgRecoveryAmount || 0,
        avgResponseTime: data.avgResponseTime || 0,
        preventionRate: data.preventionRate || 0
      },
      reasonCodeBreakdown: data.reasonCodeBreakdown || [],
      monthlyTrend: data.monthlyTrend || [],
      roi: {
        totalSaved: data.roi?.totalSaved || 0,
        totalCost: data.roi?.totalCost || 0,
        netROI: data.roi?.netROI || 0,
        roiPercentage: data.roi?.roiPercentage || 0
      },
      isdBreakdown: data.isdBreakdown || null,
      period: {
        startDate: params.startDate,
        endDate: params.endDate
      }
    };
  }

  /**
   * Get win rate statistics segmented by reason code.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date (ISO format)
   * @param {string} params.endDate - End date (ISO format)
   * @returns {Promise<Object>} { winRates: [{ reasonCode, wins, losses, winRate }] }
   */
  async getWinRatesByReasonCode(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics/win-rates', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          clientId: this.clientId
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
   * Generate an auto-representment template based on the dispute reason code
   * and available evidence. CB911 uses historical win data to build optimized
   * response templates.
   *
   * @param {string} disputeId - CB911 dispute identifier
   * @param {Object} [context] - Additional context for template generation
   * @returns {Promise<Object>} { template, requiredFields, winProbability, narrative }
   */
  async generateRepresentmentTemplate(disputeId, context = {}) {
    const payload = {
      disputeId,
      clientId: this.clientId,
      additionalContext: {
        guestName: context.guestName || null,
        confirmationNumber: context.confirmationNumber || null,
        stayDetails: context.stayDetails || null,
        availableEvidence: context.availableEvidence || []
      }
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/auto-template`, payload)
    );

    const data = response.data;

    return {
      template: data.template || null,
      requiredFields: data.requiredFields || [],
      optionalFields: data.optionalFields || [],
      winProbability: data.winProbability || 0,
      narrative: data.narrative || '',
      evidenceChecklist: data.evidenceChecklist || [],
      reasonCodeGuidance: data.reasonCodeGuidance || ''
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Chargebacks911 webhook payload into a structured event object.
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
        logger.error('[CB911] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid CB911 webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[CB911] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid CB911 webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature if secret is configured
    const signature = headers['x-cb911-signature'] || headers['x-chargebacks911-signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[CB911] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.event || parsed.eventType,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-cb911-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-cb911-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Chargebacks911.
   *
   * @param {Object} config
   * @param {string} config.callbackUrl - Endpoint URL for CB911 to POST to
   * @param {string[]} [config.events] - Event types to subscribe to
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      clientId: this.clientId,
      callbackUrl: config.callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      version: 'v2'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[CB911] Webhook registered: ${config.callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a Chargebacks911 dispute/alert into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute or alert data from CB911
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.disputeId || portalData.alertId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || 0);
    const reasonCode = portalData.reasonCode || portalData.disputeReason || '';
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
      disputeDate: portalData.alertDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      alertType: portalData.alertType || (portalData.alertId ? 'PREVENTION' : 'DISPUTE'),
      isPreChargeback: !!portalData.alertId || portalData.alertType === 'prevention',
      isdClassification: portalData.isdClassification || null,
      winProbability: portalData.winProbability || null,
      transactionId: portalData.transactionId || portalData.acquirerRefNum || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'CHARGEBACKS911',
      rawData: portalData
    };
  }

  /**
   * Map a CB911 status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Status value from CB911
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_CB911[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a CB911 reason code to a structured object with category and description.
   *
   * @param {string} portalCode - Reason code from CB911
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase().replace(/\s+/g, '_');
    const known = CB911_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    // Attempt to categorize by keyword
    const upper = normalized.toUpperCase();
    if (upper.includes('FRAUD')) {
      return { code: normalized, category: 'FRAUD', description: `Fraud - ${portalCode}` };
    }
    if (upper.includes('SERVICE') || upper.includes('CANCEL') || upper.includes('CREDIT')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Consumer Dispute - ${portalCode}` };
    }
    if (upper.includes('DUPLICATE') || upper.includes('AMOUNT') || upper.includes('PROCESSING')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Processing Error - ${portalCode}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Chargebacks911 Code: ${portalCode}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Chargebacks911 API.
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
        message: 'Chargebacks911 API is reachable',
        details: {
          portalType: 'CHARGEBACKS911',
          clientId: this.clientId,
          isdEnabled: this.isdEnabled,
          apiVersion: 'v2',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Chargebacks911 API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'CHARGEBACKS911',
          clientId: this.clientId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = Chargebacks911Adapter;
