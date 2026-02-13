/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Kount (Equifax Company) Dispute Adapter
 *
 * Implements two-way integration with Kount's AI-driven fraud prevention
 * and dispute management platform:
 *   - Dispute Management: Full lifecycle dispute handling with evidence
 *     submission, response workflows, and outcome tracking.
 *   - Risk Assessment: Omniscore risk scoring powered by Kount's Identity
 *     Trust Global Network with device fingerprinting and behavioral analysis.
 *   - Pre-Dispute Prevention: Real-time transaction signals that identify
 *     high-risk orders before they become chargebacks.
 *   - Identity Trust: Leverages Equifax identity data for cardholder
 *     verification and fraud signal enrichment.
 *   - Network Data: Cross-merchant intelligence from billions of interactions
 *     across the Kount network.
 *
 * Auth: API Key sent in Authorization header (Bearer token).
 * Base URL: https://api.kount.com/api/v2 (configurable)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// KOUNT REASON CODE MAPPINGS
// =============================================================================

const KOUNT_REASON_CODES = {
  'FRAUD_TRUE': {
    code: 'FRAUD_TRUE',
    category: 'FRAUD',
    description: 'Confirmed fraudulent transaction identified by Kount network',
    compellingEvidenceTypes: ['device_fingerprint', 'ip_address_match', 'avs_cvv_match', 'prior_undisputed_transactions']
  },
  'FRAUD_FRIENDLY': {
    code: 'FRAUD_FRIENDLY',
    category: 'FRAUD',
    description: 'Friendly fraud - legitimate cardholder disputing valid transaction',
    compellingEvidenceTypes: ['proof_of_delivery', 'guest_registration', 'folio', 'correspondence']
  },
  'FRAUD_SYNTHETIC': {
    code: 'FRAUD_SYNTHETIC',
    category: 'FRAUD',
    description: 'Synthetic identity fraud detected via Equifax identity data',
    compellingEvidenceTypes: ['identity_verification', 'device_fingerprint', 'behavioral_data']
  },
  'UNAUTHORIZED_USE': {
    code: 'UNAUTHORIZED_USE',
    category: 'FRAUD',
    description: 'Unauthorized use of payment credentials',
    compellingEvidenceTypes: ['avs_cvv_match', 'ip_address_match', 'device_fingerprint', '3ds_authentication']
  },
  'SERVICE_NOT_PROVIDED': {
    code: 'SERVICE_NOT_PROVIDED',
    category: 'CONSUMER_DISPUTE',
    description: 'Service or merchandise not provided to cardholder',
    compellingEvidenceTypes: ['check_in_confirmation', 'folio', 'guest_registration_card', 'key_card_logs']
  },
  'SERVICE_QUALITY': {
    code: 'SERVICE_QUALITY',
    category: 'CONSUMER_DISPUTE',
    description: 'Service quality dispute - not as described',
    compellingEvidenceTypes: ['service_description', 'terms_accepted', 'guest_correspondence', 'quality_documentation']
  },
  'CREDIT_EXPECTED': {
    code: 'CREDIT_EXPECTED',
    category: 'CONSUMER_DISPUTE',
    description: 'Credit or refund expected but not received',
    compellingEvidenceTypes: ['refund_policy', 'terms_and_conditions', 'credit_issued_proof']
  },
  'CANCELLED_SERVICE': {
    code: 'CANCELLED_SERVICE',
    category: 'CONSUMER_DISPUTE',
    description: 'Cancelled service or reservation dispute',
    compellingEvidenceTypes: ['cancellation_policy', 'no_show_documentation', 'reservation_confirmation']
  },
  'PROCESSING_ERROR': {
    code: 'PROCESSING_ERROR',
    category: 'PROCESSING_ERROR',
    description: 'Processing error - duplicate or incorrect charge',
    compellingEvidenceTypes: ['transaction_records', 'folio', 'itemized_charges']
  },
  'AUTHORIZATION_ISSUE': {
    code: 'AUTHORIZATION_ISSUE',
    category: 'AUTHORIZATION',
    description: 'Authorization-related dispute',
    compellingEvidenceTypes: ['authorization_log', 'transaction_receipt', 'terminal_data']
  }
};

// Kount portal status -> AccuDefend internal status
const STATUS_MAP_FROM_KOUNT = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'review': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'investigating': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'representment_sent': 'SUBMITTED',
  'won': 'WON',
  'reversed': 'WON',
  'chargeback_reversed': 'WON',
  'lost': 'LOST',
  'chargeback_upheld': 'LOST',
  'accepted': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'resolved': 'RESOLVED'
};

// AccuDefend status -> Kount portal status
const STATUS_MAP_TO_KOUNT = {
  'PENDING': 'open',
  'IN_REVIEW': 'review',
  'SUBMITTED': 'responded',
  'WON': 'won',
  'LOST': 'lost',
  'EXPIRED': 'expired'
};

// Kount risk level thresholds for Omniscore
const RISK_LEVELS = {
  LOW: { min: 0, max: 29, label: 'Low Risk' },
  MEDIUM: { min: 30, max: 59, label: 'Medium Risk' },
  HIGH: { min: 60, max: 79, label: 'High Risk' },
  CRITICAL: { min: 80, max: 100, label: 'Critical Risk' }
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'dispute.created',
  'dispute.updated',
  'dispute.resolved',
  'dispute.escalated',
  'risk.alert',
  'risk.assessment_complete',
  'evidence.requested',
  'outcome.updated',
  'signal.pre_dispute'
];


class KountAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey        - Kount API Key (used as Bearer token)
   * @param {string} [config.credentials.merchantId]  - Kount Merchant ID
   * @param {string} [config.credentials.siteId]      - Kount Site ID for device fingerprinting
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {boolean} [config.credentials.equifaxEnabled] - Equifax identity data enrichment
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'KOUNT',
      baseUrl: config.baseUrl || process.env.KOUNT_API_URL || 'https://api.kount.com/api/v2'
    });

    this.merchantId = this.credentials.merchantId || '';
    this.siteId = this.credentials.siteId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.equifaxEnabled = this.credentials.equifaxEnabled || false;

    // Initialize HTTP client with Kount Bearer token auth
    this._initHttpClient({
      'Authorization': `Bearer ${this.credentials.apiKey}`,
      'X-Kount-Merchant-ID': this.merchantId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with the Kount API and verify credentials.
   * Kount uses Bearer token authentication with an API key.
   *
   * @returns {Promise<Object>} { authenticated, merchantId, features, networkStats }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/auth/verify')
      );

      const data = response.data;
      logger.info(`[Kount] Authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: data.merchantId || this.merchantId,
        accountName: data.accountName || '',
        features: data.features || [],
        equifaxEnabled: data.equifaxEnabled || this.equifaxEnabled,
        networkStats: data.networkStats || null,
        expiresAt: data.tokenExpiry || null
      };
    } catch (error) {
      logger.error(`[Kount] Authentication failed: ${this._extractErrorMessage(error)}`);
      return {
        authenticated: false,
        merchantId: this.merchantId,
        error: this._extractErrorMessage(error)
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Kount
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from Kount.
   * Enriches the dispute with risk scoring data if available.
   *
   * @param {Object} disputeData - Raw dispute data from Kount
   * @returns {Promise<Object>} Normalized dispute object in AccuDefend format
   */
  async receiveDispute(disputeData) {
    logger.info(`[Kount] Receiving dispute: ${disputeData.disputeId || disputeData.id}`);

    // Enrich with Omniscore risk data if available
    if (disputeData.orderId && !disputeData.omniscore) {
      try {
        const riskData = await this.getRiskAssessment(disputeData.orderId);
        disputeData._riskEnriched = true;
        disputeData.omniscore = riskData.omniscore;
        disputeData.riskFactors = riskData.factors;
        disputeData.deviceFingerprint = riskData.deviceFingerprint;
      } catch (err) {
        logger.warn(`[Kount] Could not enrich dispute with risk data: ${err.message}`);
      }
    }

    const normalized = this.normalizeDispute(disputeData);
    logger.info(`[Kount] Dispute normalized: ${normalized.disputeId} (Omniscore: ${disputeData.omniscore || 'N/A'})`);
    return normalized;
  }

  /**
   * Query Kount for the current status of a dispute.
   *
   * @param {string} disputeId - Kount dispute identifier
   * @returns {Promise<Object>} Dispute status with risk data
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
      omniscore: data.omniscore || null,
      riskLevel: data.riskLevel || this._getRiskLevel(data.omniscore),
      networkSignals: data.networkSignals || null
    };
  }

  /**
   * Fetch a paginated list of disputes from Kount.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore, page }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || undefined,
      riskLevel: params.riskLevel || undefined,
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
  // OUTBOUND: Send TO Kount
  // ===========================================================================

  /**
   * Submit an evidence package to Kount for a dispute.
   *
   * @param {string} disputeId - Kount dispute identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message, timestamp }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      disputeId,
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
        orderId: metadata.orderId
      },
      riskContext: {
        omniscore: metadata.omniscore || null,
        deviceFingerprint: metadata.deviceFingerprint || null,
        riskFactors: metadata.riskFactors || []
      },
      merchantNarrative: metadata.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[Kount] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Kount for a dispute.
   *
   * @param {string} disputeId - Kount dispute identifier
   * @param {Object} responseData - Response with evidence and guest/stay details
   * @returns {Promise<Object>} { responseId, status, message, timestamp }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      responseType: responseData.representmentType || 'representment',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceInfo: responseData.compellingEvidence?.deviceInfo || null,
        omniscoreAtTransaction: responseData.compellingEvidence?.omniscoreAtTransaction || null
      },
      guestDetails: {
        name: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        loyaltyNumber: responseData.guestDetails?.loyaltyNumber || null,
        identityTrustScore: responseData.guestDetails?.identityTrustScore || null
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

    logger.info(`[Kount] Response submitted for dispute ${disputeId}`);

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
   * @param {string} disputeId - Kount dispute identifier
   * @returns {Promise<Object>} { accepted, disputeId, responseId, message }
   */
  async acceptDispute(disputeId) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      action: 'accept_liability',
      reason: 'Merchant accepts liability',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[Kount] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  // ===========================================================================
  // RISK ASSESSMENT (Omniscore)
  // ===========================================================================

  /**
   * Retrieve a risk assessment for an order, including the Omniscore,
   * device fingerprint data, and risk factors from the Kount network.
   *
   * @param {string} orderId - Order/transaction identifier
   * @returns {Promise<Object>} Risk assessment with Omniscore and factors
   */
  async getRiskAssessment(orderId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/risk-assessments`, {
        params: { orderId, merchantId: this.merchantId }
      })
    );

    const data = response.data;

    return {
      orderId,
      omniscore: data.omniscore || data.score || 0,
      riskLevel: this._getRiskLevel(data.omniscore || data.score),
      factors: data.factors || data.riskFactors || [],
      deviceFingerprint: {
        id: data.deviceFingerprint?.id || data.deviceId || null,
        type: data.deviceFingerprint?.type || null,
        os: data.deviceFingerprint?.os || null,
        browser: data.deviceFingerprint?.browser || null,
        trustLevel: data.deviceFingerprint?.trustLevel || null
      },
      networkData: {
        previousTransactions: data.networkData?.previousTransactions || 0,
        previousDisputes: data.networkData?.previousDisputes || 0,
        networkTrustScore: data.networkData?.networkTrustScore || null,
        crossMerchantSignals: data.networkData?.crossMerchantSignals || []
      },
      identityTrust: this.equifaxEnabled ? {
        verificationStatus: data.identityTrust?.verificationStatus || null,
        matchScore: data.identityTrust?.matchScore || null,
        riskIndicators: data.identityTrust?.riskIndicators || []
      } : null,
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Get pre-dispute prevention signals for an order.
   * Signals indicate transactions likely to result in disputes based on
   * network-wide pattern analysis.
   *
   * @param {string} orderId - Order/transaction identifier
   * @returns {Promise<Object>} Pre-dispute signals and recommendations
   */
  async getPreDisputeSignals(orderId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/orders/${orderId}/signals`, {
        params: { merchantId: this.merchantId }
      })
    );

    const data = response.data;

    return {
      orderId,
      signalCount: data.signals?.length || 0,
      signals: (data.signals || []).map(signal => ({
        type: signal.type,
        severity: signal.severity,
        description: signal.description,
        recommendation: signal.recommendation,
        confidence: signal.confidence || 0
      })),
      disputeProbability: data.disputeProbability || 0,
      recommendedAction: data.recommendedAction || 'monitor',
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Submit dispute outcome data back to Kount for network learning.
   * This two-way sync improves Omniscore accuracy over time.
   *
   * @param {string} disputeId - Kount dispute identifier
   * @param {Object} outcome - Outcome details
   * @param {string} outcome.result - 'won', 'lost', or 'accepted'
   * @param {number} [outcome.recoveredAmount] - Amount recovered
   * @param {string} [outcome.reasonCode] - Final reason code
   * @returns {Promise<Object>} { synced, disputeId, message }
   */
  async syncDisputeOutcome(disputeId, outcome) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      result: outcome.result,
      recoveredAmount: outcome.recoveredAmount || 0,
      reasonCode: outcome.reasonCode || null,
      resolvedAt: outcome.resolvedAt || new Date().toISOString(),
      notes: outcome.notes || ''
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/outcome`, payload)
    );

    logger.info(`[Kount] Dispute outcome synced for ${disputeId}: ${outcome.result}`);

    return {
      synced: true,
      disputeId,
      message: response.data.message || 'Outcome synced successfully',
      networkImpact: response.data.networkImpact || null
    };
  }

  // ===========================================================================
  // ANALYTICS AND WIN RATE TRACKING
  // ===========================================================================

  /**
   * Fetch analytics from Kount including win rates, risk score correlations,
   * and dispute outcome metrics.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date (ISO format)
   * @param {string} params.endDate - End date (ISO format)
   * @param {string} [params.groupBy] - Group results by 'day', 'week', 'month'
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
        totalDisputes: data.totalDisputes || 0,
        totalRecovered: data.totalRecovered || 0,
        totalLost: data.totalLost || 0,
        winRate: data.winRate || 0,
        avgOmniscore: data.avgOmniscore || 0,
        preventionRate: data.preventionRate || 0,
        avgResponseTime: data.avgResponseTime || 0
      },
      riskScoreCorrelation: data.riskScoreCorrelation || [],
      reasonCodeBreakdown: data.reasonCodeBreakdown || [],
      monthlyTrend: data.monthlyTrend || [],
      networkComparison: {
        industryWinRate: data.networkComparison?.industryWinRate || 0,
        merchantRank: data.networkComparison?.merchantRank || null,
        percentile: data.networkComparison?.percentile || null
      },
      period: { startDate: params.startDate, endDate: params.endDate }
    };
  }

  /**
   * Get win rate statistics segmented by risk level (Omniscore range).
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date
   * @param {string} params.endDate - End date
   * @returns {Promise<Object>} Win rates by risk level
   */
  async getWinRatesByRiskLevel(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics/win-rates', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          merchantId: this.merchantId,
          groupBy: 'riskLevel'
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
   * Generate an auto-representment template leveraging Kount's risk data
   * and network intelligence for optimized dispute responses.
   *
   * @param {string} disputeId - Kount dispute identifier
   * @param {Object} [context] - Additional context
   * @returns {Promise<Object>} Template with win probability and evidence checklist
   */
  async generateRepresentmentTemplate(disputeId, context = {}) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      additionalContext: {
        guestName: context.guestName || null,
        confirmationNumber: context.confirmationNumber || null,
        stayDetails: context.stayDetails || null,
        availableEvidence: context.availableEvidence || [],
        includeRiskData: context.includeRiskData !== false
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
      riskDataIncluded: data.riskDataIncluded || false,
      omniscoreContext: data.omniscoreContext || null,
      reasonCodeGuidance: data.reasonCodeGuidance || ''
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Kount webhook payload into a structured event object.
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
        logger.error('[Kount] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Kount webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Kount] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Kount webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature if secret is configured
    const signature = headers['x-kount-signature'] || headers['x-kount-hmac'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Kount] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.event || parsed.eventType,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-kount-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-kount-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Kount.
   *
   * @param {Object} config
   * @param {string} config.callbackUrl - Endpoint URL for Kount to POST to
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
      version: 'v2'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[Kount] Webhook registered: ${config.callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a Kount dispute into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute data from Kount
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.disputeId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || 0);
    const reasonCode = portalData.reasonCode || portalData.disputeReason || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || '',
      cardBrand: portalData.cardBrand || portalData.cardNetwork || 'UNKNOWN',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      omniscore: portalData.omniscore || null,
      riskLevel: portalData.riskLevel || this._getRiskLevel(portalData.omniscore),
      deviceFingerprint: portalData.deviceFingerprint || null,
      networkSignals: portalData.networkSignals || null,
      transactionId: portalData.transactionId || portalData.orderId || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'KOUNT',
      rawData: portalData
    };
  }

  /**
   * Map a Kount status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Status value from Kount
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_KOUNT[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Kount reason code to a structured object.
   *
   * @param {string} portalCode - Reason code from Kount
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase().replace(/\s+/g, '_');
    const known = KOUNT_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    const upper = normalized.toUpperCase();
    if (upper.includes('FRAUD') || upper.includes('UNAUTHORIZED')) {
      return { code: normalized, category: 'FRAUD', description: `Fraud - ${portalCode}` };
    }
    if (upper.includes('SERVICE') || upper.includes('CANCEL') || upper.includes('CREDIT')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Consumer Dispute - ${portalCode}` };
    }
    if (upper.includes('PROCESSING') || upper.includes('DUPLICATE')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Processing Error - ${portalCode}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Kount Code: ${portalCode}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Kount API.
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
        message: 'Kount API is reachable',
        details: {
          portalType: 'KOUNT',
          merchantId: this.merchantId,
          equifaxEnabled: this.equifaxEnabled,
          apiVersion: 'v2',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Kount API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'KOUNT',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Determine risk level label from Omniscore value.
   *
   * @param {number|null} omniscore - Omniscore value (0-100)
   * @returns {string|null} Risk level label
   */
  _getRiskLevel(omniscore) {
    if (omniscore === null || omniscore === undefined) return null;
    const score = Number(omniscore);
    if (score <= RISK_LEVELS.LOW.max) return RISK_LEVELS.LOW.label;
    if (score <= RISK_LEVELS.MEDIUM.max) return RISK_LEVELS.MEDIUM.label;
    if (score <= RISK_LEVELS.HIGH.max) return RISK_LEVELS.HIGH.label;
    return RISK_LEVELS.CRITICAL.label;
  }
}

module.exports = KountAdapter;
