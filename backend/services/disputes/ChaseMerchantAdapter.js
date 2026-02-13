/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Chase Merchant Services (Chase Paymentech) Dispute Adapter
 *
 * Implements two-way integration with Chase Merchant Services for chargeback
 * and dispute management via the Chase API Gateway:
 *   - Receive chargeback notifications and retrieval requests
 *   - Submit compelling evidence and representment packages
 *   - Track dispute lifecycle through Chase's merchant portal
 *   - Support for first chargebacks, pre-arbitration, and arbitration cases
 *
 * Auth: OAuth2 client credentials via Chase API Gateway.
 * Base URL: https://api.chase.com/merchant/api/v2 (configurable via CHASE_API_URL env var)
 *
 * Chase Paymentech (JPMorgan Chase) is one of the largest US merchant acquirers.
 * Their API provides real-time chargeback management with support for Visa,
 * Mastercard, Discover, and American Express disputes.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// CHASE REASON CODE MAPPINGS
// =============================================================================

const CHASE_REASON_CODES = {
  '10.1': { code: '10.1', category: 'FRAUD', description: 'EMV Liability Shift Counterfeit Fraud' },
  '10.2': { code: '10.2', category: 'FRAUD', description: 'EMV Liability Shift Non-Counterfeit Fraud' },
  '10.3': { code: '10.3', category: 'FRAUD', description: 'Other Fraud - Card-Present Environment' },
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
  'F29':  { code: 'F29',  category: 'FRAUD', description: 'Card Not Present (Amex)' },
  'C31':  { code: 'C31',  category: 'CONSUMER_DISPUTE', description: 'Services Not Rendered (Amex)' }
};

// Chase portal status -> AccuDefend internal status
const STATUS_MAP_FROM_CHASE = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending_response': 'PENDING',
  'action_required': 'PENDING',
  'in_review': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'documents_received': 'IN_REVIEW',
  'represented': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'evidence_submitted': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'chargeback_reversed': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'pre_arbitration_lost': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// Chase webhook event types
const WEBHOOK_EVENTS = [
  'chargeback.created',
  'chargeback.updated',
  'chargeback.status_changed',
  'chargeback.evidence_due',
  'chargeback.resolved',
  'retrieval.created',
  'pre_arbitration.created'
];


class ChaseMerchantAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId     - OAuth2 Client ID from Chase Developer Portal
   * @param {string} config.credentials.clientSecret - OAuth2 Client Secret
   * @param {string} config.credentials.merchantId   - Chase Merchant ID (MID)
   * @param {string} [config.credentials.platformId] - Platform/ISO ID for payment facilitators
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.baseUrl] - Override default API base URL
   * @param {string} [config.tokenUrl] - Override OAuth2 token endpoint
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'CHASE',
      baseUrl: config.baseUrl || process.env.CHASE_API_URL || 'https://api.chase.com/merchant/api/v2'
    });

    this.merchantId = this.credentials.merchantId;
    this.clientId = this.credentials.clientId;
    this.clientSecret = this.credentials.clientSecret;
    this.platformId = this.credentials.platformId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.tokenUrl = config.tokenUrl || process.env.CHASE_TOKEN_URL || 'https://api.chase.com/oauth2/token';

    // OAuth2 token state
    this.accessToken = null;
    this.tokenExpiresAt = 0;

    // Initialize HTTP client
    this._initHttpClient({
      'X-Merchant-ID': this.merchantId,
      'X-Platform-ID': this.platformId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Chase API Gateway using OAuth2 client credentials flow.
   * The access token is cached and refreshed automatically before expiration.
   *
   * @returns {Promise<Object>} { authenticated: boolean, expiresAt, message }
   */
  async authenticate() {
    try {
      // Chase uses Basic auth for the token endpoint (client_id:client_secret)
      const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const tokenPayload = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'merchant.chargebacks merchant.disputes merchant.documents'
      });

      const response = await this._withRetry(() =>
        this.httpClient.post(this.tokenUrl, tokenPayload.toString(), {
          baseURL: '',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
          }
        })
      );

      const data = response.data;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000) - 60000;

      // Update default Authorization header
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

      logger.info(`[Chase] OAuth2 authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        expiresAt: new Date(this.tokenExpiresAt).toISOString(),
        tokenType: data.token_type || 'Bearer',
        message: 'Successfully authenticated with Chase API Gateway'
      };
    } catch (error) {
      logger.error(`[Chase] OAuth2 authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `OAuth2 authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  /**
   * Ensure we have a valid access token, refreshing if necessary.
   */
  async _ensureAuthenticated() {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      const result = await this.authenticate();
      if (!result.authenticated) {
        throw new Error(`Chase authentication failed: ${result.message}`);
      }
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Chase
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from Chase.
   *
   * @param {Object} disputeData - Raw chargeback data from Chase
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[Chase] Receiving dispute: ${disputeData.chargebackId || disputeData.caseId || disputeData.id}`);

    const normalized = this.normalizeDispute(disputeData);

    logger.info(`[Chase] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to Chase for a chargeback dispute.
   *
   * Chase requires documents to be uploaded individually with metadata,
   * then linked to the chargeback representment.
   *
   * @param {string} disputeId - Chase chargeback identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    await this._ensureAuthenticated();

    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      representmentCategory: metadata.evidenceCategory || 'compelling_evidence',
      documents: files.map((file, index) => ({
        documentType: file.type || 'supporting_document',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`,
        documentCategory: file.category || 'general'
      })),
      transactionInfo: {
        cardholderName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        serviceStartDate: metadata.checkInDate,
        serviceEndDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authorizationCode: metadata.authorizationCode,
        acquirerReferenceNumber: metadata.arn
      },
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v2/chargebacks/${disputeId}/documents`, payload)
    );

    logger.info(`[Chase] Evidence submitted for chargeback ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      documentIds: response.data.documentIds || [],
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Query Chase for the current status of a chargeback.
   *
   * @param {string} disputeId - Chase chargeback identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    await this._ensureAuthenticated();

    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v2/merchants/${this.merchantId}/chargebacks/${disputeId}`)
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
      financialImpact: data.financialImpact || null
    };
  }

  /**
   * Push a representment response to Chase for a chargeback.
   *
   * @param {string} disputeId - Chase chargeback identifier
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    await this._ensureAuthenticated();

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      representmentType: responseData.representmentType || 'first_representment',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceInfo: responseData.compellingEvidence?.deviceInfo || null,
        ce3Indicator: responseData.compellingEvidence?.ce3 || false
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
      this.httpClient.post(`/api/v2/chargebacks/${disputeId}/represent`, payload)
    );

    logger.info(`[Chase] Representment submitted for chargeback ${disputeId}`);

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
   * @param {string} disputeId - Chase chargeback identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    await this._ensureAuthenticated();

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      action: 'accept_liability',
      reason: 'Liability accepted by merchant',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v2/chargebacks/${disputeId}/accept`, payload)
    );

    logger.info(`[Chase] Chargeback ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Chargeback accepted'
    };
  }

  /**
   * Fetch a paginated list of chargebacks from Chase.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    await this._ensureAuthenticated();

    const queryParams = {
      fromDate: params.since || undefined,
      status: params.status || undefined,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100),
      stage: params.stage || undefined
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v2/merchants/${this.merchantId}/chargebacks`, { params: queryParams })
    );

    const data = response.data;
    const chargebacks = data.chargebacks || data.disputes || data.data || [];

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
   * Parse a raw Chase webhook payload.
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
        logger.error('[Chase] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Chase webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Chase] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Chase webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature
    const signature = headers['x-chase-signature'] || headers['X-Chase-Signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Chase] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event || parsed.type,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-chase-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || parsed.id || headers['x-chase-delivery-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook with Chase API Gateway.
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
      merchantId: this.merchantId,
      callbackUrl,
      events,
      active: true,
      signingSecret: webhookSecret,
      description: 'AccuDefend chargeback defense integration'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/api/v2/webhooks', payload)
    );

    logger.info(`[Chase] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a Chase chargeback into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw chargeback data from Chase
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.chargebackId || portalData.caseId || portalData.disputeId || portalData.id;
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
      portalType: 'CHASE',
      rawData: portalData
    };
  }

  /**
   * Map a Chase status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_CHASE[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = CHASE_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    if (normalized.startsWith('10.')) return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    if (normalized.startsWith('11.')) return { code: normalized, category: 'AUTHORIZATION', description: `Visa Authorization - Code ${normalized}` };
    if (normalized.startsWith('12.')) return { code: normalized, category: 'PROCESSING_ERROR', description: `Visa Processing Error - Code ${normalized}` };
    if (normalized.startsWith('13.')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    if (normalized.startsWith('48')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Mastercard Dispute - Code ${normalized}` };

    return { code: normalized, category: 'UNKNOWN', description: `Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Chase API Gateway.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      await this._ensureAuthenticated();
      const response = await this.httpClient.get('/api/v2/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Chase Merchant Services API is reachable',
        details: {
          portalType: 'CHASE',
          merchantId: this.merchantId,
          platformId: this.platformId,
          tokenValid: Date.now() < this.tokenExpiresAt,
          apiVersion: 'v2',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Chase API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'CHASE',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = ChaseMerchantAdapter;
