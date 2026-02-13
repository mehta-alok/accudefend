/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Authorize.net Dispute Adapter
 *
 * Implements two-way integration with Authorize.net's chargeback and
 * dispute management system:
 *   - Receive chargeback notifications and retrieval requests
 *   - Submit compelling evidence and representment documentation
 *   - Track dispute lifecycle through Authorize.net's portal
 *   - Support for both eCheck and credit card chargebacks
 *
 * Auth: API Login ID + Transaction Key sent in request body.
 * Base URL: https://api.authorize.net/v1 (configurable via AUTHNET_API_URL env var)
 *
 * Authorize.net (a Visa company) uses a JSON-based API for dispute management.
 * Authentication is unique in that credentials are sent within the request body
 * as a merchantAuthentication object rather than in headers. The API supports
 * both XML and JSON formats; this adapter uses JSON exclusively.
 *
 * Note: Authorize.net also provides ARB (Automated Recurring Billing) and CIM
 * (Customer Information Manager) services, but this adapter focuses solely on
 * the chargeback/dispute management functionality.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// AUTHORIZE.NET REASON CODE MAPPINGS
// =============================================================================

/**
 * Authorize.net passes through the card network's native reason codes.
 * This table covers the most common codes seen through their platform.
 */
const AUTHNET_REASON_CODES = {
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

// Authorize.net portal status -> AccuDefend internal status
const STATUS_MAP_FROM_AUTHNET = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'awaiting_response': 'PENDING',
  'action_required': 'PENDING',
  'under_review': 'IN_REVIEW',
  'in_review': 'IN_REVIEW',
  'documents_received': 'IN_REVIEW',
  'represented': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'evidence_submitted': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'reversed': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'accepted': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// Authorize.net webhook event types
const WEBHOOK_EVENTS = [
  'net.authorize.payment.dispute.created',
  'net.authorize.payment.dispute.updated',
  'net.authorize.payment.dispute.evidence_due',
  'net.authorize.payment.dispute.resolved',
  'net.authorize.payment.dispute.closed'
];


class AuthorizeNetAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiLoginId     - Authorize.net API Login ID
   * @param {string} config.credentials.transactionKey - Authorize.net Transaction Key
   * @param {string} config.credentials.merchantId     - Internal merchant identifier
   * @param {string} [config.credentials.signatureKey]  - Webhook signature verification key
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'AUTHORIZE_NET',
      baseUrl: config.baseUrl || process.env.AUTHNET_API_URL || 'https://api.authorize.net/v1'
    });

    this.merchantId = this.credentials.merchantId;
    this.apiLoginId = this.credentials.apiLoginId;
    this.transactionKey = this.credentials.transactionKey;
    this.signatureKey = this.credentials.signatureKey || '';

    // Initialize HTTP client
    // Authorize.net does not use header-based auth; credentials go in request body
    this._initHttpClient({
      'X-Anet-Merchant-ID': this.merchantId
    });
  }

  /**
   * Build the merchantAuthentication object required in every API request body.
   *
   * @returns {Object} { name, transactionKey }
   */
  _buildAuthObject() {
    return {
      name: this.apiLoginId,
      transactionKey: this.transactionKey
    };
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Authorize.net by making a test API call.
   * Authorize.net uses API Login ID + Transaction Key in the request body.
   *
   * @returns {Promise<Object>} { authenticated: boolean, merchantId, message }
   */
  async authenticate() {
    try {
      const payload = {
        merchantAuthentication: this._buildAuthObject(),
        action: 'validate'
      };

      const response = await this._withRetry(() =>
        this.httpClient.post('/v1/merchants/self', payload)
      );

      const data = response.data;
      logger.info(`[AuthorizeNet] Authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        merchantName: data.merchantName || data.name,
        message: 'Successfully authenticated with Authorize.net API'
      };
    } catch (error) {
      logger.error(`[AuthorizeNet] Authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `Authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Authorize.net
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from Authorize.net.
   *
   * @param {Object} disputeData - Raw chargeback data from Authorize.net
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[AuthorizeNet] Receiving chargeback: ${disputeData.chargebackId || disputeData.disputeId || disputeData.id}`);

    const normalized = this.normalizeDispute(disputeData);

    logger.info(`[AuthorizeNet] Chargeback normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to Authorize.net for a chargeback.
   *
   * Authorize.net accepts evidence as base64-encoded documents with metadata.
   * The merchantAuthentication is included in every request body.
   *
   * @param {string} disputeId - Authorize.net chargeback identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      merchantAuthentication: this._buildAuthObject(),
      chargebackId: disputeId,
      evidenceCategory: metadata.evidenceCategory || 'compelling_evidence',
      documents: files.map((file, index) => ({
        documentType: file.type || 'supporting_document',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`
      })),
      transactionDetails: {
        cardholderName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        serviceStartDate: metadata.checkInDate,
        serviceEndDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authorizationCode: metadata.authorizationCode
      },
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/v1/chargebacks/${disputeId}/documents`, payload)
    );

    logger.info(`[AuthorizeNet] Evidence submitted for chargeback ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Query Authorize.net for the current status of a chargeback.
   *
   * @param {string} disputeId - Authorize.net chargeback identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    const payload = {
      merchantAuthentication: this._buildAuthObject(),
      chargebackId: disputeId
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/v1/chargebacks/${disputeId}/status`, payload)
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
      chargebackType: data.chargebackType || null,
      cycleIndicator: data.cycleIndicator || null
    };
  }

  /**
   * Push a representment response to Authorize.net for a chargeback.
   *
   * @param {string} disputeId - Authorize.net chargeback identifier
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      merchantAuthentication: this._buildAuthObject(),
      chargebackId: disputeId,
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
      documentIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/v1/chargebacks/${disputeId}/respond`, payload)
    );

    logger.info(`[AuthorizeNet] Representment submitted for chargeback ${disputeId}`);

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
   * @param {string} disputeId - Authorize.net chargeback identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    const payload = {
      merchantAuthentication: this._buildAuthObject(),
      chargebackId: disputeId,
      action: 'accept_liability',
      reason: 'Liability accepted by merchant',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/v1/chargebacks/${disputeId}/respond`, payload)
    );

    logger.info(`[AuthorizeNet] Chargeback ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Chargeback accepted'
    };
  }

  /**
   * Fetch a paginated list of chargebacks from Authorize.net.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    const payload = {
      merchantAuthentication: this._buildAuthObject(),
      filters: {
        startDate: params.since || undefined,
        status: params.status || undefined,
        chargebackType: params.chargebackType || undefined
      },
      paging: {
        page: params.page || 1,
        pageSize: Math.min(params.limit || 50, 100)
      }
    };

    // Remove undefined filter values
    Object.keys(payload.filters).forEach(key => {
      if (payload.filters[key] === undefined) delete payload.filters[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.post('/v1/chargebacks/list', payload)
    );

    const data = response.data;
    const chargebacks = data.chargebacks || data.data || [];

    return {
      disputes: chargebacks.map((d) => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.total || chargebacks.length,
      hasMore: data.hasMore || (data.paging?.page < data.paging?.totalPages),
      page: data.paging?.page || payload.paging.page
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Authorize.net webhook payload.
   *
   * Authorize.net webhooks use the following structure:
   *   { notificationId, eventType, eventDate, webhookId, payload: { ... } }
   *
   * Signature verification uses HMAC-SHA512 with the signature key.
   *
   * @param {Object} headers - Request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} { event, data, timestamp, rawData }
   */
  parseWebhookPayload(headers, body) {
    let parsed;
    const rawBody = typeof body === 'string' ? body : (Buffer.isBuffer(body) ? body.toString('utf-8') : JSON.stringify(body));

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[AuthorizeNet] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Authorize.net webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[AuthorizeNet] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Authorize.net webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature
    const signature = headers['x-anet-signature'] || headers['X-ANET-Signature'];
    if (this.signatureKey && signature) {
      const expectedSig = crypto.createHmac('sha512', this.signatureKey)
        .update(rawBody)
        .digest('hex')
        .toUpperCase();

      // Authorize.net signature format: sha512=HEXSTRING
      const sigValue = signature.replace('sha512=', '').toUpperCase();

      if (expectedSig !== sigValue) {
        logger.warn('[AuthorizeNet] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event,
      data: parsed.payload || parsed.data || parsed,
      timestamp: parsed.eventDate || headers['x-anet-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || parsed.notificationId || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook with Authorize.net.
   *
   * @param {Object} config - Webhook configuration
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active }
   */
  async registerWebhook(config) {
    const callbackUrl = config.callbackUrl || config;
    const events = config.events || WEBHOOK_EVENTS;

    const payload = {
      merchantAuthentication: this._buildAuthObject(),
      url: callbackUrl,
      eventTypes: events,
      status: 'active'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/v1/webhooks', payload)
    );

    const webhook = response.data;
    logger.info(`[AuthorizeNet] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: webhook.webhookId || webhook.id,
      callbackUrl,
      events,
      active: webhook.status === 'active',
      message: webhook.message || 'Webhook registered successfully'
    };
  }

  // ===========================================================================
  // NORMALIZATION
  // ===========================================================================

  /**
   * Normalize an Authorize.net chargeback into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw chargeback data from Authorize.net
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.chargebackId || portalData.disputeId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || portalData.arn || null;
    const amount = parseFloat(portalData.amount || portalData.chargebackAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);
    const cardBrand = portalData.cardBrand || portalData.cardType || portalData.paymentMethod || 'UNKNOWN';

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.last4 || portalData.accountNumber?.slice(-4) || '',
      cardBrand: cardBrand.toUpperCase(),
      guestName: portalData.cardholderName || portalData.customerName || portalData.firstName
        ? `${portalData.firstName || ''} ${portalData.lastName || ''}`.trim()
        : '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      chargebackType: portalData.chargebackType || 'standard',
      transactionId: portalData.transactionId || portalData.transId || portalData.arn || '',
      transactionDate: portalData.transactionDate || portalData.submitTimeUTC || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      authorizationCode: portalData.authorizationCode || portalData.authCode || '',
      cycleIndicator: portalData.cycleIndicator || null,
      portalType: 'AUTHORIZE_NET',
      rawData: portalData
    };
  }

  /**
   * Map an Authorize.net status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_AUTHNET[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = AUTHNET_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    if (normalized.startsWith('10.')) return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    if (normalized.startsWith('11.')) return { code: normalized, category: 'AUTHORIZATION', description: `Visa Authorization - Code ${normalized}` };
    if (normalized.startsWith('12.')) return { code: normalized, category: 'PROCESSING_ERROR', description: `Visa Processing Error - Code ${normalized}` };
    if (normalized.startsWith('13.')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    if (normalized.startsWith('48')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Mastercard Dispute - Code ${normalized}` };
    if (normalized.startsWith('UA')) return { code: normalized, category: 'FRAUD', description: `Discover Fraud - Code ${normalized}` };

    return { code: normalized, category: 'UNKNOWN', description: `Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity with the Authorize.net API.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const payload = {
        merchantAuthentication: this._buildAuthObject()
      };

      const response = await this.httpClient.post('/v1/health', payload, { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Authorize.net API is reachable',
        details: {
          portalType: 'AUTHORIZE_NET',
          merchantId: this.merchantId,
          apiLoginId: this.apiLoginId ? `${this.apiLoginId.substring(0, 4)}****` : 'not set',
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Authorize.net API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'AUTHORIZE_NET',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = AuthorizeNetAdapter;
