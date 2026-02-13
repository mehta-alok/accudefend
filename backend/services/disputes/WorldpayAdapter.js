/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Worldpay (FIS) Dispute Adapter
 *
 * Implements two-way integration with Worldpay's merchant dispute management portal:
 *   - Receive chargeback and retrieval notifications
 *   - Submit compelling evidence for representment
 *   - Track dispute lifecycle and outcomes
 *   - Manage webhook subscriptions for real-time notifications
 *
 * Auth: API Key sent via Authorization header.
 * Base URL: https://api.worldpay.com/v1 (configurable via WORLDPAY_API_URL env var)
 *
 * Worldpay (now part of FIS) provides merchant acquiring services globally
 * and processes transactions across all major card networks. Their dispute
 * management portal supports first and second chargebacks, retrievals,
 * and pre-arbitration cases.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// WORLDPAY REASON CODE MAPPINGS
// =============================================================================

const WORLDPAY_REASON_CODES = {
  '10.1': { code: '10.1', category: 'FRAUD', description: 'EMV Liability Shift Counterfeit Fraud' },
  '10.4': { code: '10.4', category: 'FRAUD', description: 'Other Fraud - Card-Absent Environment' },
  '10.5': { code: '10.5', category: 'FRAUD', description: 'Visa Fraud Monitoring Program' },
  '13.1': { code: '13.1', category: 'CONSUMER_DISPUTE', description: 'Merchandise/Services Not Received' },
  '13.2': { code: '13.2', category: 'CONSUMER_DISPUTE', description: 'Cancelled Recurring Transaction' },
  '13.3': { code: '13.3', category: 'CONSUMER_DISPUTE', description: 'Not as Described or Defective' },
  '13.6': { code: '13.6', category: 'CONSUMER_DISPUTE', description: 'Credit Not Processed' },
  '13.7': { code: '13.7', category: 'CONSUMER_DISPUTE', description: 'Cancelled Merchandise/Services' },
  '4837': { code: '4837', category: 'FRAUD', description: 'No Cardholder Authorization (MC)' },
  '4853': { code: '4853', category: 'CONSUMER_DISPUTE', description: 'Cardholder Dispute (MC)' },
  '4863': { code: '4863', category: 'CONSUMER_DISPUTE', description: 'Cardholder Does Not Recognize (MC)' },
  'UA01': { code: 'UA01', category: 'FRAUD', description: 'Fraud - Card Present (Discover)' },
  'UA02': { code: 'UA02', category: 'FRAUD', description: 'Fraud - Card Not Present (Discover)' },
  'C28':  { code: 'C28',  category: 'CONSUMER_DISPUTE', description: 'Cancelled Recurring (Discover)' },
  'F10':  { code: 'F10',  category: 'FRAUD', description: 'Missing Imprint (Amex)' },
  'F29':  { code: 'F29',  category: 'FRAUD', description: 'Card Not Present (Amex)' }
};

// Worldpay portal status -> AccuDefend internal status
const STATUS_MAP_FROM_WORLDPAY = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'action_required': 'PENDING',
  'reviewing': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'represented': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'merchant_won': 'WON',
  'reversed': 'WON',
  'won': 'WON',
  'merchant_lost': 'LOST',
  'lost': 'LOST',
  'pre_arbitration': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// Worldpay webhook event types
const WEBHOOK_EVENTS = [
  'dispute.created',
  'dispute.updated',
  'dispute.evidence_due',
  'dispute.resolved',
  'retrieval.created',
  'retrieval.fulfilled'
];


class WorldpayAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey        - Worldpay API Key
   * @param {string} config.credentials.merchantId    - Worldpay Merchant ID
   * @param {string} [config.credentials.entityId]    - Entity ID for multi-entity accounts
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'WORLDPAY',
      baseUrl: config.baseUrl || process.env.WORLDPAY_API_URL || 'https://api.worldpay.com/v1'
    });

    this.merchantId = this.credentials.merchantId;
    this.entityId = this.credentials.entityId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';

    // Initialize HTTP client with Worldpay API Key auth
    this._initHttpClient({
      'Authorization': `ApiKey ${this.credentials.apiKey}`,
      'X-Merchant-ID': this.merchantId,
      'X-Entity-ID': this.entityId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Worldpay's API by validating the API key.
   * Worldpay uses API Key-based authentication in the Authorization header.
   *
   * @returns {Promise<Object>} { authenticated: boolean, merchantId, message }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/api/v1/merchants/self')
      );

      logger.info(`[Worldpay] Authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        entityId: this.entityId,
        merchantName: response.data.merchantName || response.data.name,
        message: 'Successfully authenticated with Worldpay API'
      };
    } catch (error) {
      logger.error(`[Worldpay] Authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `Authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Worldpay
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from Worldpay.
   *
   * @param {Object} disputeData - Raw dispute data from Worldpay
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[Worldpay] Receiving dispute: ${disputeData.disputeId || disputeData.chargebackId || disputeData.id}`);

    const normalized = this.normalizeDispute(disputeData);

    logger.info(`[Worldpay] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to Worldpay for a dispute.
   *
   * @param {string} disputeId - Worldpay dispute identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      disputeId,
      merchantId: this.merchantId,
      evidenceType: metadata.evidenceCategory || 'compelling_evidence',
      documents: files.map((file, index) => ({
        type: file.type || 'supporting_document',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`
      })),
      transaction: {
        guestName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        amount: metadata.transactionAmount,
        date: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authCode: metadata.authorizationCode
      },
      notes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[Worldpay] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Query Worldpay for the current status of a dispute.
   *
   * @param {string} disputeId - Worldpay dispute identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v1/disputes/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.lastUpdated || data.updatedAt,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      dueDate: data.responseDeadline || data.dueDate || null,
      disputeType: data.disputeType || null
    };
  }

  /**
   * Push a representment response to Worldpay.
   *
   * @param {string} disputeId - Worldpay dispute identifier
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      representmentType: responseData.representmentType || 'first_representment',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceInfo: responseData.compellingEvidence?.deviceInfo || null
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
      this.httpClient.post(`/api/v1/disputes/${disputeId}/response`, payload)
    );

    logger.info(`[Worldpay] Response submitted for dispute ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a dispute.
   *
   * @param {string} disputeId - Worldpay dispute identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      action: 'accept_liability',
      notes: 'Liability accepted by merchant',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/response`, payload)
    );

    logger.info(`[Worldpay] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  /**
   * Fetch a paginated list of disputes from Worldpay.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      fromDate: params.since || undefined,
      status: params.status || undefined,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100),
      merchantId: this.merchantId
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/api/v1/disputes', { params: queryParams })
    );

    const data = response.data;
    const disputes = data.disputes || data.data || [];

    return {
      disputes: disputes.map((d) => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.total || disputes.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Worldpay webhook payload.
   *
   * @param {Object} headers - Request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} { event, data, timestamp, rawData }
   */
  parseWebhookPayload(headers, body) {
    let parsed;

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[Worldpay] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Worldpay webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Worldpay] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Worldpay webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature
    const signature = headers['x-worldpay-signature'] || headers['X-Worldpay-Signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Worldpay] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event || parsed.type,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-worldpay-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || parsed.id || headers['x-worldpay-delivery-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook with Worldpay.
   *
   * @param {Object} config - Webhook configuration
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    const callbackUrl = config.callbackUrl || config;
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      url: callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      description: 'AccuDefend dispute integration'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/api/v1/webhooks', payload)
    );

    logger.info(`[Worldpay] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a Worldpay dispute into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute data from Worldpay
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.disputeId || portalData.chargebackId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || portalData.arn || null;
    const amount = parseFloat(portalData.amount || portalData.chargebackAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);
    const cardBrand = portalData.cardBrand || portalData.scheme || portalData.cardType || 'UNKNOWN';

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.last4 || portalData.maskedPan?.slice(-4) || '',
      cardBrand: cardBrand.toUpperCase(),
      guestName: portalData.cardholderName || portalData.customerName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      disputeType: portalData.disputeType || portalData.type || 'chargeback',
      transactionId: portalData.transactionId || portalData.arn || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'WORLDPAY',
      rawData: portalData
    };
  }

  /**
   * Map a Worldpay status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_WORLDPAY[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = WORLDPAY_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    if (normalized.startsWith('10.')) return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    if (normalized.startsWith('13.')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    if (normalized.startsWith('48')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Mastercard Dispute - Code ${normalized}` };
    if (normalized.startsWith('UA')) return { code: normalized, category: 'FRAUD', description: `Discover Fraud - Code ${normalized}` };

    return { code: normalized, category: 'UNKNOWN', description: `Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity with the Worldpay API.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/api/v1/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Worldpay API is reachable',
        details: {
          portalType: 'WORLDPAY',
          merchantId: this.merchantId,
          entityId: this.entityId,
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Worldpay API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'WORLDPAY',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = WorldpayAdapter;
