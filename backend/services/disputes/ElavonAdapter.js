/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Elavon Payment Processor Dispute Adapter
 *
 * Implements two-way integration with Elavon's Converge gateway for
 * chargeback and dispute management:
 *   - Receive dispute notifications from Elavon's chargeback management system
 *   - Submit compelling evidence and representment responses
 *   - Track dispute status through Elavon's lifecycle
 *   - Accept liability on disputes when appropriate
 *
 * Auth: API Key + Merchant ID sent in request headers.
 * Base URL: https://api.elavon.com/v1 (configurable via ELAVON_API_URL env var)
 *
 * Elavon's Converge platform processes Visa, Mastercard, Discover, and Amex
 * transactions. Their dispute API provides real-time chargeback notifications
 * and supports evidence submission in PDF, JPEG, and PNG formats.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// ELAVON REASON CODE MAPPINGS
// =============================================================================

/**
 * Elavon maps disputes using the card network's native reason codes.
 * This table covers common Visa and Mastercard codes seen through Elavon.
 */
const ELAVON_REASON_CODES = {
  '10.1': { code: '10.1', category: 'FRAUD', description: 'EMV Liability Shift Counterfeit Fraud' },
  '10.4': { code: '10.4', category: 'FRAUD', description: 'Other Fraud - Card-Absent Environment' },
  '13.1': { code: '13.1', category: 'CONSUMER_DISPUTE', description: 'Merchandise/Services Not Received' },
  '13.2': { code: '13.2', category: 'CONSUMER_DISPUTE', description: 'Cancelled Recurring Transaction' },
  '13.3': { code: '13.3', category: 'CONSUMER_DISPUTE', description: 'Not as Described or Defective' },
  '13.6': { code: '13.6', category: 'CONSUMER_DISPUTE', description: 'Credit Not Processed' },
  '13.7': { code: '13.7', category: 'CONSUMER_DISPUTE', description: 'Cancelled Merchandise/Services' },
  '4837': { code: '4837', category: 'FRAUD', description: 'No Cardholder Authorization (MC)' },
  '4853': { code: '4853', category: 'CONSUMER_DISPUTE', description: 'Cardholder Dispute (MC)' },
  '4863': { code: '4863', category: 'CONSUMER_DISPUTE', description: 'Cardholder Does Not Recognize (MC)' },
  'C28':  { code: 'C28',  category: 'AUTHORIZATION', description: 'Cancelled Recurring (Discover)' },
  'F10':  { code: 'F10',  category: 'FRAUD', description: 'Missing Imprint (Amex)' },
  'F29':  { code: 'F29',  category: 'FRAUD', description: 'Card Not Present (Amex)' },
  'C31':  { code: 'C31',  category: 'CONSUMER_DISPUTE', description: 'Services Not Rendered (Amex)' }
};

// Elavon portal status -> AccuDefend internal status
const STATUS_MAP_FROM_ELAVON = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending_review': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'evidence_received': 'IN_REVIEW',
  'responded': 'SUBMITTED',
  'representment_submitted': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'reversed': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'accepted': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// Elavon webhook event types
const WEBHOOK_EVENTS = [
  'dispute.created',
  'dispute.updated',
  'dispute.status_changed',
  'dispute.evidence_required',
  'dispute.resolved',
  'dispute.expired'
];


class ElavonAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey      - Elavon Converge API Key
   * @param {string} config.credentials.merchantId  - Elavon Merchant ID
   * @param {string} config.credentials.accountId   - Elavon Account ID (optional)
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'ELAVON',
      baseUrl: config.baseUrl || process.env.ELAVON_API_URL || 'https://api.elavon.com/v1'
    });

    this.merchantId = this.credentials.merchantId;
    this.accountId = this.credentials.accountId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';

    // Initialize HTTP client with Elavon-specific auth headers
    this._initHttpClient({
      'X-Api-Key': this.credentials.apiKey,
      'X-Merchant-ID': this.merchantId,
      'X-Account-ID': this.accountId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Elavon's Converge API and validate credentials.
   * Elavon uses API Key + Merchant ID header-based authentication.
   *
   * @returns {Promise<Object>} { authenticated: boolean, merchantId, message }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/merchants/self')
      );

      logger.info(`[Elavon] Authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        accountId: this.accountId,
        merchantName: response.data.merchantName || response.data.name,
        message: 'Successfully authenticated with Elavon Converge API'
      };
    } catch (error) {
      logger.error(`[Elavon] Authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `Authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Elavon
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from Elavon via webhook or poll.
   *
   * @param {Object} disputeData - Raw dispute data from Elavon
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[Elavon] Receiving dispute: ${disputeData.disputeId || disputeData.chargebackId || disputeData.id}`);

    const normalized = this.normalizeDispute(disputeData);

    logger.info(`[Elavon] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit a compelling evidence package to Elavon for a dispute.
   *
   * Elavon expects evidence as base64-encoded documents with metadata describing
   * the document type and relevance to the dispute.
   *
   * @param {string} disputeId - Elavon dispute identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
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
        content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
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
        authorizationCode: metadata.authorizationCode
      },
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[Elavon] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Query Elavon for the current status of a dispute.
   *
   * @param {string} disputeId - Elavon dispute identifier
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
      dueDate: data.responseDeadline || data.dueDate || null
    };
  }

  /**
   * Push a representment response to Elavon for a dispute.
   *
   * @param {string} disputeId - Elavon dispute identifier
   * @param {Object} response - Response data including evidence IDs and narrative
   * @returns {Promise<Object>} { responseId, status, message }
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
      this.httpClient.post(`/api/v1/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[Elavon] Response submitted for dispute ${disputeId}`);

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
   * @param {string} disputeId - Elavon dispute identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      action: 'accept_liability',
      merchantNotes: 'Liability accepted by merchant',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[Elavon] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  /**
   * Fetch a paginated list of disputes from Elavon.
   *
   * @param {Object} params - Query parameters
   * @param {string} [params.since] - ISO date string; disputes after this date
   * @param {string} [params.status] - Filter by status
   * @param {number} [params.page] - Page number (1-based)
   * @param {number} [params.limit] - Results per page
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      status: params.status || undefined,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100),
      merchantId: this.merchantId
    };

    // Remove undefined values
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
   * Parse a raw Elavon webhook payload into a structured event object.
   *
   * Elavon sends webhooks as JSON:
   *   { eventType: string, data: object, timestamp: string, id: string }
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
        logger.error('[Elavon] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Elavon webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Elavon] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Elavon webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature if secret is configured
    const signature = headers['x-elavon-signature'] || headers['X-Elavon-Signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Elavon] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-elavon-timestamp'] || new Date().toISOString(),
      webhookId: parsed.id || headers['x-elavon-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Elavon for receiving dispute notifications.
   *
   * @param {Object} config - Webhook configuration
   * @param {string} config.callbackUrl - Our endpoint URL
   * @param {string[]} [config.events] - Event types to subscribe to
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    const callbackUrl = config.callbackUrl || config;
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/api/v1/webhooks', payload)
    );

    logger.info(`[Elavon] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize an Elavon dispute into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute data from Elavon
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.disputeId || portalData.chargebackId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.chargebackAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    // Determine card brand from BIN or explicit field
    const cardBrand = portalData.cardBrand || portalData.cardType || this._inferCardBrand(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedCardNumber?.slice(-4) || '',
      cardBrand,
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      transactionId: portalData.transactionId || portalData.acquirerReferenceNumber || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      authorizationCode: portalData.authorizationCode || '',
      portalType: 'ELAVON',
      rawData: portalData
    };
  }

  /**
   * Map an Elavon status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Status value from Elavon
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_ELAVON[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object with category and description.
   *
   * @param {string} portalCode - Reason code from Elavon
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = ELAVON_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    // Attempt to categorize by prefix
    if (normalized.startsWith('10.')) {
      return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    }
    if (normalized.startsWith('13.')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    }
    if (normalized.startsWith('48')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Mastercard Dispute - Code ${normalized}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Elavon API.
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
        message: 'Elavon Converge API is reachable',
        details: {
          portalType: 'ELAVON',
          merchantId: this.merchantId,
          accountId: this.accountId,
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Elavon API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'ELAVON',
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
   * Infer card brand from reason code prefix.
   *
   * @param {string} reasonCode - The dispute reason code
   * @returns {string} Card brand string
   */
  _inferCardBrand(reasonCode) {
    if (!reasonCode) return 'UNKNOWN';
    const code = String(reasonCode).trim();

    if (code.startsWith('10.') || code.startsWith('11.') || code.startsWith('12.') || code.startsWith('13.')) {
      return 'VISA';
    }
    if (code.startsWith('48') || code.startsWith('49')) {
      return 'MASTERCARD';
    }
    if (code.startsWith('C') || code.startsWith('UA') || code.startsWith('RG')) {
      return 'DISCOVER';
    }
    if (code.startsWith('F') || code.startsWith('P') || code.startsWith('C31') || code.startsWith('C32')) {
      return 'AMEX';
    }

    return 'UNKNOWN';
  }
}

module.exports = ElavonAdapter;
