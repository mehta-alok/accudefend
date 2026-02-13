/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Global Payments Dispute Adapter
 *
 * Implements two-way integration with Global Payments' GP API for
 * dispute and chargeback management:
 *   - Receive real-time dispute notifications
 *   - Submit compelling evidence and representment responses
 *   - Track dispute lifecycle through GP's merchant portal
 *   - Support for multiple card network dispute flows
 *
 * Auth: API Key + App Secret (HMAC-signed requests).
 * Base URL: https://apis.globalpay.com/ucp/v1 (configurable via GP_API_URL env var)
 *
 * Global Payments provides merchant acquiring and processing services worldwide.
 * Their GP API (Unified Commerce Platform) offers a RESTful interface for
 * managing disputes, with support for real-time webhooks and document upload.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// GLOBAL PAYMENTS REASON CODE MAPPINGS
// =============================================================================

const GP_REASON_CODES = {
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
  'F10':  { code: 'F10',  category: 'FRAUD', description: 'Missing Imprint (Amex)' },
  'F29':  { code: 'F29',  category: 'FRAUD', description: 'Card Not Present (Amex)' }
};

// GP portal status -> AccuDefend internal status
const STATUS_MAP_FROM_GP = {
  'initiated': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'action_required': 'PENDING',
  'under_review': 'IN_REVIEW',
  'in_review': 'IN_REVIEW',
  'evidence_provided': 'IN_REVIEW',
  'represented': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'merchant_won': 'WON',
  'reversed': 'WON',
  'won': 'WON',
  'merchant_lost': 'LOST',
  'lost': 'LOST',
  'accepted': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'settled': 'RESOLVED'
};

// GP webhook event types
const WEBHOOK_EVENTS = [
  'dispute.initiated',
  'dispute.updated',
  'dispute.action_required',
  'dispute.resolved',
  'dispute.expired'
];


class GlobalPaymentsAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.appId       - GP API Application ID (API Key)
   * @param {string} config.credentials.appSecret   - GP API Application Secret
   * @param {string} config.credentials.merchantId  - Global Payments Merchant ID
   * @param {string} [config.credentials.accountId] - Sub-account identifier
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'GLOBAL_PAYMENTS',
      baseUrl: config.baseUrl || process.env.GP_API_URL || 'https://apis.globalpay.com/ucp/v1'
    });

    this.merchantId = this.credentials.merchantId;
    this.appId = this.credentials.appId;
    this.appSecret = this.credentials.appSecret;
    this.accountId = this.credentials.accountId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';

    // GP API access token (obtained via authenticate())
    this.accessToken = null;
    this.tokenExpiresAt = 0;

    // Initialize HTTP client
    this._initHttpClient({
      'X-GP-Version': '2021-03-22'
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Global Payments GP API using App ID + App Secret.
   * GP API uses a nonce + secret based authentication that returns an access token.
   *
   * @returns {Promise<Object>} { authenticated: boolean, expiresAt, message }
   */
  async authenticate() {
    try {
      const nonce = crypto.randomBytes(16).toString('hex');
      const timestamp = new Date().toISOString();
      const secretHash = crypto.createHmac('sha512', this.appSecret)
        .update(nonce)
        .update(timestamp)
        .digest('hex');

      const payload = {
        app_id: this.appId,
        nonce,
        secret: secretHash,
        grant_type: 'client_credentials'
      };

      const response = await this._withRetry(() =>
        this.httpClient.post('/accesstoken', payload)
      );

      const data = response.data;
      this.accessToken = data.token || data.access_token;
      this.tokenExpiresAt = Date.now() + ((data.seconds_to_expire || 3600) * 1000) - 60000;

      // Update default Authorization header
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
      this.httpClient.defaults.headers.common['X-GP-Merchant-ID'] = this.merchantId;

      logger.info(`[GlobalPayments] Authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        expiresAt: new Date(this.tokenExpiresAt).toISOString(),
        message: 'Successfully authenticated with Global Payments GP API'
      };
    } catch (error) {
      logger.error(`[GlobalPayments] Authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `Authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  /**
   * Ensure we have a valid access token.
   */
  async _ensureAuthenticated() {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      const result = await this.authenticate();
      if (!result.authenticated) {
        throw new Error(`Global Payments authentication failed: ${result.message}`);
      }
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Global Payments
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from Global Payments.
   *
   * @param {Object} disputeData - Raw dispute data from GP
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[GlobalPayments] Receiving dispute: ${disputeData.id || disputeData.dispute_id}`);

    const normalized = this.normalizeDispute(disputeData);

    logger.info(`[GlobalPayments] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to Global Payments for a dispute.
   *
   * @param {string} disputeId - GP dispute identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    await this._ensureAuthenticated();

    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    // GP API requires documents to be uploaded individually, then linked
    const documentIds = [];

    for (const file of files) {
      const docPayload = {
        dispute_id: disputeId,
        document_type: file.type || 'PROOF_OF_DELIVERY',
        file_name: file.fileName,
        mime_type: file.mimeType || 'application/pdf',
        content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || 'Supporting evidence document'
      };

      const docResponse = await this._withRetry(() =>
        this.httpClient.post(`/api/v1/disputes/${disputeId}/evidence`, docPayload)
      );

      documentIds.push(docResponse.data.id || docResponse.data.document_id);
    }

    // Submit the evidence summary with transaction details
    const summaryPayload = {
      dispute_id: disputeId,
      merchant_id: this.merchantId,
      document_ids: documentIds,
      transaction_details: {
        guest_name: metadata.guestName,
        confirmation_number: metadata.confirmationNumber,
        check_in_date: metadata.checkInDate,
        check_out_date: metadata.checkOutDate,
        transaction_amount: metadata.transactionAmount,
        transaction_date: metadata.transactionDate,
        transaction_id: metadata.transactionId
      },
      notes: metadata.notes || '',
      idempotency_key: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/evidence/submit`, summaryPayload)
    );

    logger.info(`[GlobalPayments] Evidence submitted for dispute ${disputeId}: ${documentIds.length} documents`);

    return {
      submissionId: response.data.id || response.data.submission_id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      documentIds,
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Query GP for the current status of a dispute.
   *
   * @param {string} disputeId - GP dispute identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    await this._ensureAuthenticated();

    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v1/disputes/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.time_last_updated || data.updatedAt,
      notes: data.notes || '',
      outcome: data.result || null,
      outcomeDate: data.result_time || null,
      dueDate: data.response_due_date || data.time_to_respond_by || null,
      stage: data.stage || null
    };
  }

  /**
   * Push a representment response to Global Payments.
   *
   * @param {string} disputeId - GP dispute identifier
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    await this._ensureAuthenticated();

    const payload = {
      dispute_id: disputeId,
      merchant_id: this.merchantId,
      action: 'CHALLENGE',
      compelling_evidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        prior_undisputed_transactions: responseData.compellingEvidence?.priorTransactions || [],
        device_info: responseData.compellingEvidence?.deviceInfo || null
      },
      guest_details: {
        name: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        loyalty_number: responseData.guestDetails?.loyaltyNumber || null
      },
      stay_details: {
        property_name: responseData.stayDetails?.propertyName,
        confirmation_number: responseData.stayDetails?.confirmationNumber,
        check_in_date: responseData.stayDetails?.checkInDate,
        check_out_date: responseData.stayDetails?.checkOutDate,
        room_type: responseData.stayDetails?.roomType,
        room_rate: responseData.stayDetails?.roomRate,
        total_charges: responseData.stayDetails?.totalCharges,
        no_show: responseData.stayDetails?.noShow || false
      },
      document_ids: responseData.evidenceIds || [],
      merchant_narrative: responseData.narrative || '',
      idempotency_key: this._generateIdempotencyKey('response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[GlobalPayments] Response submitted for dispute ${disputeId}`);

    return {
      responseId: response.data.id || response.data.action_id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a dispute.
   *
   * @param {string} disputeId - GP dispute identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    await this._ensureAuthenticated();

    const payload = {
      dispute_id: disputeId,
      merchant_id: this.merchantId,
      action: 'ACCEPT',
      notes: 'Liability accepted by merchant',
      idempotency_key: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[GlobalPayments] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.id || response.data.action_id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  /**
   * Fetch a paginated list of disputes from Global Payments.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    await this._ensureAuthenticated();

    const queryParams = {
      from_time_created: params.since || undefined,
      status: params.status || undefined,
      page: params.page || 1,
      page_size: Math.min(params.limit || 50, 100),
      account_id: this.accountId || undefined
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
      totalCount: data.total_count || data.total || disputes.length,
      hasMore: data.has_more || (data.paging?.page < data.paging?.total_pages),
      page: data.paging?.page || queryParams.page
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Global Payments webhook payload.
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
        logger.error('[GlobalPayments] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Global Payments webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[GlobalPayments] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Global Payments webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature
    const signature = headers['x-gp-signature'] || headers['X-GP-Signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[GlobalPayments] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.type || parsed.event || parsed.action?.type,
      data: parsed.data || parsed.action || parsed,
      timestamp: parsed.time_created || headers['x-gp-timestamp'] || new Date().toISOString(),
      webhookId: parsed.id || headers['x-gp-delivery-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook with Global Payments.
   *
   * @param {Object} config - Webhook configuration
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    await this._ensureAuthenticated();

    const callbackUrl = config.callbackUrl || config;
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchant_id: this.merchantId,
      url: callbackUrl,
      events,
      status: 'ACTIVE',
      secret: webhookSecret,
      content_type: 'application/json'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/api/v1/webhooks', payload)
    );

    logger.info(`[GlobalPayments] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: response.data.id || response.data.webhook_id,
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
   * Normalize a GP dispute into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute data from GP
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.id || portalData.dispute_id;
    const caseNumber = portalData.case_id || portalData.reference || portalData.case_number || null;
    const amount = parseFloat(portalData.amount || portalData.dispute_amount || portalData.transaction_amount || 0);

    const reasonCode = portalData.reason_code || portalData.reasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);
    const cardBrand = portalData.card_brand || portalData.payment_method?.card?.brand || 'UNKNOWN';

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transaction_currency || 'USD',
      cardLastFour: portalData.card_last_four || portalData.payment_method?.card?.number_last4 || '',
      cardBrand: cardBrand.toUpperCase(),
      guestName: portalData.cardholder_name || portalData.customer_name || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.time_created || portalData.dispute_date || portalData.created_at,
      dueDate: portalData.time_to_respond_by || portalData.response_due_date || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      stage: portalData.stage || 'CHARGEBACK',
      transactionId: portalData.transaction_id || portalData.transaction_reference || '',
      transactionDate: portalData.transaction_time || portalData.transaction_date || null,
      merchantDescriptor: portalData.merchant_name || '',
      portalType: 'GLOBAL_PAYMENTS',
      rawData: portalData
    };
  }

  /**
   * Map a GP status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_GP[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = GP_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    if (normalized.startsWith('10.')) return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    if (normalized.startsWith('13.')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    if (normalized.startsWith('48')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Mastercard Dispute - Code ${normalized}` };
    if (normalized.startsWith('UA')) return { code: normalized, category: 'FRAUD', description: `Discover Fraud - Code ${normalized}` };
    if (normalized.startsWith('F')) return { code: normalized, category: 'FRAUD', description: `Amex Fraud - Code ${normalized}` };

    return { code: normalized, category: 'UNKNOWN', description: `Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity with the Global Payments GP API.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      await this._ensureAuthenticated();
      const response = await this.httpClient.get('/api/v1/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Global Payments GP API is reachable',
        details: {
          portalType: 'GLOBAL_PAYMENTS',
          merchantId: this.merchantId,
          accountId: this.accountId,
          tokenValid: Date.now() < this.tokenExpiresAt,
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Global Payments API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'GLOBAL_PAYMENTS',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = GlobalPaymentsAdapter;
