/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * TSYS (now part of Global Payments) Dispute Adapter
 *
 * Implements two-way integration with TSYS/TransFirst's merchant dispute portal:
 *   - Receive chargeback and retrieval request notifications
 *   - Submit compelling evidence and representment documentation
 *   - Track dispute lifecycle through TSYS's chargeback management system
 *   - Support for first chargebacks and pre-arbitration cases
 *
 * Auth: API Key sent via X-Api-Key header.
 * Base URL: https://api.tsys.com/v1 (configurable via TSYS_API_URL env var)
 *
 * TSYS (Total System Services) was acquired by Global Payments in 2019 but
 * maintains its own processing platform and dispute management portal.
 * The TSYS Dispute API handles chargebacks for Visa, Mastercard, Discover,
 * and American Express transactions processed on the TSYS platform.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// TSYS REASON CODE MAPPINGS
// =============================================================================

const TSYS_REASON_CODES = {
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
  '4834': { code: '4834', category: 'PROCESSING_ERROR', description: 'Point-of-Interaction Error (MC)' },
  'UA01': { code: 'UA01', category: 'FRAUD', description: 'Fraud - Card Present (Discover)' },
  'UA02': { code: 'UA02', category: 'FRAUD', description: 'Fraud - Card Not Present (Discover)' },
  'C28':  { code: 'C28',  category: 'CONSUMER_DISPUTE', description: 'Cancelled Recurring (Discover)' },
  'F10':  { code: 'F10',  category: 'FRAUD', description: 'Missing Imprint (Amex)' },
  'F29':  { code: 'F29',  category: 'FRAUD', description: 'Card Not Present (Amex)' }
};

// TSYS portal status -> AccuDefend internal status
const STATUS_MAP_FROM_TSYS = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'awaiting_merchant': 'PENDING',
  'documents_requested': 'PENDING',
  'under_review': 'IN_REVIEW',
  'in_review': 'IN_REVIEW',
  'documents_received': 'IN_REVIEW',
  'represented': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'second_presentment': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'reversed': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'pre_arbitration': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// TSYS webhook event types
const WEBHOOK_EVENTS = [
  'chargeback.created',
  'chargeback.updated',
  'chargeback.documents_due',
  'chargeback.resolved',
  'retrieval.created',
  'retrieval.fulfilled',
  'pre_arbitration.created'
];


class TSYSAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - TSYS API Key
   * @param {string} config.credentials.merchantId   - TSYS Merchant ID
   * @param {string} [config.credentials.terminalId] - Terminal ID for POS merchants
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'TSYS',
      baseUrl: config.baseUrl || process.env.TSYS_API_URL || 'https://api.tsys.com/v1'
    });

    this.merchantId = this.credentials.merchantId;
    this.terminalId = this.credentials.terminalId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';

    // Initialize HTTP client with TSYS API Key auth
    this._initHttpClient({
      'X-Api-Key': this.credentials.apiKey,
      'X-Merchant-ID': this.merchantId,
      'X-Terminal-ID': this.terminalId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with TSYS API by validating the API key.
   * TSYS uses static API Key authentication sent in the X-Api-Key header.
   *
   * @returns {Promise<Object>} { authenticated: boolean, merchantId, message }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/api/v1/merchants/self')
      );

      logger.info(`[TSYS] Authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        terminalId: this.terminalId,
        merchantName: response.data.merchantName || response.data.name,
        message: 'Successfully authenticated with TSYS API'
      };
    } catch (error) {
      logger.error(`[TSYS] Authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `Authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM TSYS
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from TSYS.
   *
   * @param {Object} disputeData - Raw chargeback data from TSYS
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[TSYS] Receiving chargeback: ${disputeData.chargebackId || disputeData.caseId || disputeData.id}`);

    const normalized = this.normalizeDispute(disputeData);

    logger.info(`[TSYS] Chargeback normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to TSYS for a chargeback.
   *
   * TSYS expects documents to be submitted as base64-encoded files with
   * metadata describing the document type and its relevance to the dispute.
   *
   * @param {string} disputeId - TSYS chargeback identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      documentCategory: metadata.evidenceCategory || 'compelling_evidence',
      documents: files.map((file, index) => ({
        documentType: file.type || 'supporting_document',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`,
        sequenceNumber: index + 1
      })),
      transactionDetails: {
        cardholderName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        serviceStartDate: metadata.checkInDate,
        serviceEndDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authorizationCode: metadata.authorizationCode,
        arn: metadata.arn
      },
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/chargebacks/${disputeId}/documents`, payload)
    );

    logger.info(`[TSYS] Evidence submitted for chargeback ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Query TSYS for the current status of a chargeback.
   *
   * @param {string} disputeId - TSYS chargeback identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v1/chargebacks/${disputeId}`)
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
      chargebackStage: data.chargebackStage || data.stage || null,
      retrievalRequestId: data.retrievalRequestId || null
    };
  }

  /**
   * Push a representment response to TSYS for a chargeback.
   *
   * @param {string} disputeId - TSYS chargeback identifier
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      representmentAction: responseData.representmentType || 'represent',
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
      documentIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/chargebacks/${disputeId}/represent`, payload)
    );

    logger.info(`[TSYS] Representment submitted for chargeback ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Representment submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a chargeback.
   *
   * @param {string} disputeId - TSYS chargeback identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      action: 'accept_liability',
      reason: 'Liability accepted by merchant',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/chargebacks/${disputeId}/accept`, payload)
    );

    logger.info(`[TSYS] Chargeback ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Chargeback accepted'
    };
  }

  /**
   * Fetch a paginated list of chargebacks from TSYS.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      status: params.status || undefined,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100),
      merchantId: this.merchantId,
      stage: params.stage || undefined
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/api/v1/chargebacks', { params: queryParams })
    );

    const data = response.data;
    const chargebacks = data.chargebacks || data.data || [];

    return {
      disputes: chargebacks.map((d) => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.total || chargebacks.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw TSYS webhook payload.
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
        logger.error('[TSYS] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid TSYS webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[TSYS] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid TSYS webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature
    const signature = headers['x-tsys-signature'] || headers['X-TSYS-Signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[TSYS] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event || parsed.type,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-tsys-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || parsed.id || headers['x-tsys-delivery-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook with TSYS.
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
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      description: 'AccuDefend chargeback defense integration'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/api/v1/webhooks', payload)
    );

    logger.info(`[TSYS] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a TSYS chargeback into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw chargeback data from TSYS
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.chargebackId || portalData.caseId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || portalData.arn || null;
    const amount = parseFloat(portalData.amount || portalData.chargebackAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);
    const cardBrand = portalData.cardBrand || portalData.network || portalData.cardType || 'UNKNOWN';

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
      chargebackStage: portalData.stage || portalData.chargebackStage || 'first_chargeback',
      transactionId: portalData.transactionId || portalData.arn || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      authorizationCode: portalData.authorizationCode || '',
      retrievalRequestId: portalData.retrievalRequestId || null,
      portalType: 'TSYS',
      rawData: portalData
    };
  }

  /**
   * Map a TSYS status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_TSYS[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = TSYS_REASON_CODES[normalized];

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
   * Verify connectivity with the TSYS API.
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
        message: 'TSYS API is reachable',
        details: {
          portalType: 'TSYS',
          merchantId: this.merchantId,
          terminalId: this.terminalId,
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `TSYS API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'TSYS',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = TSYSAdapter;
