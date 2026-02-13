/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Square Dispute Adapter
 *
 * Implements two-way integration with Square's Disputes API:
 *   - Receive dispute notifications via webhooks
 *   - Submit compelling evidence including text and file-based evidence
 *   - Track dispute lifecycle through Square's dispute management
 *   - Accept disputes when merchant chooses not to challenge
 *
 * Auth: OAuth2 (access token obtained via Square OAuth2 flow).
 * Base URL: https://connect.squareup.com (configurable via SQUARE_API_URL env var)
 *
 * Square's Disputes API uses a unique evidence model where evidence is submitted
 * as typed evidence entries (text or file) rather than generic document uploads.
 * Each evidence entry has a specific evidence_type that maps to the dispute reason.
 * Supported file types: TIFF, JPEG, PDF, PNG, HEIC.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// SQUARE REASON CODE MAPPINGS
// =============================================================================

/**
 * Square uses its own set of dispute reason constants that map to
 * card network reason codes internally.
 */
const SQUARE_REASON_CODES = {
  'AMOUNT_DIFFERS': { code: 'AMOUNT_DIFFERS', category: 'PROCESSING_ERROR', description: 'Amount differs from what cardholder expected' },
  'CANCELLED': { code: 'CANCELLED', category: 'CONSUMER_DISPUTE', description: 'Cancelled merchandise/services' },
  'DUPLICATE': { code: 'DUPLICATE', category: 'PROCESSING_ERROR', description: 'Duplicate charge' },
  'EMV_LIABILITY_SHIFT': { code: 'EMV_LIABILITY_SHIFT', category: 'FRAUD', description: 'EMV liability shift' },
  'INCORRECT_AMOUNT': { code: 'INCORRECT_AMOUNT', category: 'PROCESSING_ERROR', description: 'Incorrect amount charged' },
  'NOT_AS_DESCRIBED': { code: 'NOT_AS_DESCRIBED', category: 'CONSUMER_DISPUTE', description: 'Not as described or defective' },
  'NOT_RECEIVED': { code: 'NOT_RECEIVED', category: 'CONSUMER_DISPUTE', description: 'Merchandise/services not received' },
  'NO_KNOWLEDGE': { code: 'NO_KNOWLEDGE', category: 'FRAUD', description: 'Cardholder does not recognize the charge' },
  'PAID_BY_OTHER_MEANS': { code: 'PAID_BY_OTHER_MEANS', category: 'CONSUMER_DISPUTE', description: 'Already paid by other means' },
  'CUSTOMER_REQUESTS_CREDIT': { code: 'CUSTOMER_REQUESTS_CREDIT', category: 'CONSUMER_DISPUTE', description: 'Customer requests credit not processed' },
  'UNAUTHORIZED': { code: 'UNAUTHORIZED', category: 'FRAUD', description: 'Unauthorized transaction' }
};

// Square evidence types that can be submitted
const SQUARE_EVIDENCE_TYPES = {
  'GENERIC_EVIDENCE': 'Generic supporting evidence',
  'ONLINE_OR_APP_ACCESS_LOG': 'Log showing customer access to online account',
  'AUTHORIZATION_DOCUMENTATION': 'Proof of authorization',
  'CANCELLATION_OR_REFUND_DOCUMENTATION': 'Cancellation or refund policy documentation',
  'CARDHOLDER_COMMUNICATION': 'Communication with cardholder',
  'CARDHOLDER_INFORMATION': 'Information about the cardholder',
  'PURCHASE_ACKNOWLEDGEMENT': 'Proof of purchase acknowledgement',
  'DUPLICATE_CHARGE_DOCUMENTATION': 'Evidence that charges are not duplicates',
  'PRODUCT_OR_SERVICE_DESCRIPTION': 'Description of product or service',
  'RECEIPT': 'Receipt or invoice',
  'SERVICE_RECEIVED_DOCUMENTATION': 'Proof that services were received',
  'PROOF_OF_DELIVERY_DOCUMENTATION': 'Proof of delivery',
  'RELATED_TRANSACTION_DOCUMENTATION': 'Related transaction documentation',
  'REBUTTAL_EXPLANATION': 'Written rebuttal explanation',
  'TRACKING_NUMBER': 'Shipping tracking number'
};

// Square portal status -> AccuDefend internal status
const STATUS_MAP_FROM_SQUARE = {
  'INQUIRY_EVIDENCE_REQUIRED': 'PENDING',
  'INQUIRY_PROCESSING': 'IN_REVIEW',
  'INQUIRY_CLOSED': 'RESOLVED',
  'EVIDENCE_REQUIRED': 'PENDING',
  'PROCESSING': 'IN_REVIEW',
  'WON': 'WON',
  'LOST': 'LOST',
  'ACCEPTED': 'LOST'
};

// Square webhook event types
const WEBHOOK_EVENTS = [
  'dispute.created',
  'dispute.state.updated',
  'dispute.evidence.created',
  'dispute.evidence.deleted'
];


class SquareAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.accessToken    - Square OAuth2 Access Token
   * @param {string} config.credentials.merchantId     - Square Merchant ID (Location ID)
   * @param {string} [config.credentials.applicationId] - Square Application ID
   * @param {string} [config.credentials.webhookSignatureKey] - Webhook signature verification key
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'SQUARE',
      baseUrl: config.baseUrl || process.env.SQUARE_API_URL || 'https://connect.squareup.com'
    });

    this.merchantId = this.credentials.merchantId;
    this.applicationId = this.credentials.applicationId || '';
    this.webhookSignatureKey = this.credentials.webhookSignatureKey || '';

    // Initialize HTTP client with Square OAuth2 Bearer token
    this._initHttpClient({
      'Authorization': `Bearer ${this.credentials.accessToken}`,
      'Square-Version': '2024-01-18'
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Square by validating the OAuth2 access token.
   * Square uses OAuth2 Bearer tokens obtained via the authorization flow.
   *
   * @returns {Promise<Object>} { authenticated: boolean, merchantId, message }
   */
  async authenticate() {
    try {
      // Verify token by fetching merchant info
      const response = await this._withRetry(() =>
        this.httpClient.get('/v2/merchants/me')
      );

      const merchant = response.data.merchant || response.data;
      logger.info(`[Square] Authentication successful for merchant ${merchant.id || this.merchantId}`);

      return {
        authenticated: true,
        merchantId: merchant.id || this.merchantId,
        merchantName: merchant.business_name || merchant.name,
        country: merchant.country,
        message: 'Successfully authenticated with Square API'
      };
    } catch (error) {
      logger.error(`[Square] Authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `Authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Square
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from Square.
   *
   * @param {Object} disputeData - Raw dispute data from Square
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    const dispute = disputeData.dispute || disputeData;
    logger.info(`[Square] Receiving dispute: ${dispute.dispute_id || dispute.id}`);

    const normalized = this.normalizeDispute(dispute);

    logger.info(`[Square] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to Square for a dispute.
   *
   * Square's evidence model requires each piece of evidence to be submitted
   * individually with a specific evidence_type. Text evidence and file evidence
   * use different endpoints.
   *
   * @param {string} disputeId - Square dispute identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};
    const evidenceIds = [];

    // Submit text-based evidence entries first
    if (metadata.rebuttalExplanation) {
      const textResponse = await this._withRetry(() =>
        this.httpClient.post(`/v2/disputes/${disputeId}/evidence-text`, {
          evidence_type: 'REBUTTAL_EXPLANATION',
          evidence_text: metadata.rebuttalExplanation,
          idempotency_key: this._generateIdempotencyKey('text_rebuttal')
        })
      );
      evidenceIds.push(textResponse.data.evidence?.evidence_id || textResponse.data.id);
    }

    if (metadata.trackingNumber) {
      const trackingResponse = await this._withRetry(() =>
        this.httpClient.post(`/v2/disputes/${disputeId}/evidence-text`, {
          evidence_type: 'TRACKING_NUMBER',
          evidence_text: metadata.trackingNumber,
          idempotency_key: this._generateIdempotencyKey('text_tracking')
        })
      );
      evidenceIds.push(trackingResponse.data.evidence?.evidence_id || trackingResponse.data.id);
    }

    // Submit file-based evidence
    for (const file of files) {
      const evidenceType = this._mapToSquareEvidenceType(file.type) || 'GENERIC_EVIDENCE';

      const filePayload = {
        evidence_type: evidenceType,
        content_type: file.mimeType || 'application/pdf',
        file_name: file.fileName,
        file_content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        idempotency_key: this._generateIdempotencyKey('file')
      };

      const fileResponse = await this._withRetry(() =>
        this.httpClient.post(`/v2/disputes/${disputeId}/evidence-files`, filePayload)
      );

      evidenceIds.push(fileResponse.data.evidence?.evidence_id || fileResponse.data.id);
    }

    logger.info(`[Square] Evidence submitted for dispute ${disputeId}: ${evidenceIds.length} items`);

    return {
      submissionId: evidenceIds.join(','),
      evidenceIds,
      status: 'submitted',
      message: `${evidenceIds.length} evidence items submitted successfully`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Query Square for the current status of a dispute.
   *
   * @param {string} disputeId - Square dispute identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/v2/disputes/${disputeId}`)
    );

    const dispute = response.data.dispute || response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(dispute.state || dispute.status),
      portalStatus: dispute.state || dispute.status,
      lastUpdated: dispute.updated_at || dispute.updatedAt,
      notes: dispute.note || '',
      outcome: dispute.state === 'WON' ? 'won' : dispute.state === 'LOST' ? 'lost' : null,
      outcomeDate: (dispute.state === 'WON' || dispute.state === 'LOST') ? dispute.updated_at : null,
      dueDate: dispute.due_at || dispute.evidence_due_date || null,
      evidenceCount: dispute.evidence_ids?.length || 0
    };
  }

  /**
   * Push a representment response to Square by submitting evidence and
   * then finalizing (submitting) the dispute response.
   *
   * Square requires evidence to be submitted first via submitEvidence(),
   * then the dispute response is finalized via POST /v2/disputes/{id}/submit-evidence.
   *
   * @param {string} disputeId - Square dispute identifier
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    // First, submit any remaining evidence if not already done
    if (responseData.evidenceIds && responseData.evidenceIds.length === 0) {
      const evidencePackage = {
        files: [],
        metadata: {
          rebuttalExplanation: responseData.narrative || responseData.compellingEvidence?.description || '',
          guestName: responseData.guestDetails?.name,
          confirmationNumber: responseData.stayDetails?.confirmationNumber
        }
      };
      await this.submitEvidence(disputeId, evidencePackage);
    }

    // Finalize the dispute evidence submission
    const response = await this._withRetry(() =>
      this.httpClient.post(`/v2/disputes/${disputeId}/submit-evidence`)
    );

    logger.info(`[Square] Dispute evidence finalized for ${disputeId}`);

    return {
      responseId: response.data.dispute?.dispute_id || disputeId,
      status: response.data.dispute?.state || 'PROCESSING',
      message: 'Evidence submitted and dispute response finalized',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Accept a dispute (do not challenge it).
   *
   * @param {string} disputeId - Square dispute identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.post(`/v2/disputes/${disputeId}/accept`)
    );

    logger.info(`[Square] Dispute ${disputeId} accepted`);

    return {
      accepted: true,
      disputeId,
      status: response.data.dispute?.state || 'ACCEPTED',
      message: response.data.message || 'Dispute accepted'
    };
  }

  /**
   * Fetch a paginated list of disputes from Square.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      location_id: this.merchantId || undefined,
      states: params.status ? params.status.toUpperCase() : undefined,
      cursor: params.cursor || undefined
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/v2/disputes', { params: queryParams })
    );

    const data = response.data;
    const disputes = data.disputes || [];

    return {
      disputes: disputes.map((d) => this.normalizeDispute(d)),
      totalCount: disputes.length,
      hasMore: !!data.cursor,
      cursor: data.cursor || null,
      page: params.page || 1
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Square webhook payload.
   *
   * Square webhooks use the following structure:
   *   { merchant_id, type, event_id, created_at, data: { type, id, object } }
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
        logger.error('[Square] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Square webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Square] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Square webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature (Square uses HMAC-SHA256 of URL + body)
    const signature = headers['x-square-hmacsha256-signature'] || headers['X-Square-HmacSha256-Signature'];
    if (this.webhookSignatureKey && signature) {
      const notificationUrl = headers['x-square-notification-url'] || '';
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const toSign = notificationUrl + rawBody;
      const expectedSig = crypto.createHmac('sha256', this.webhookSignatureKey)
        .update(toSign)
        .digest('base64');

      if (signature !== expectedSig) {
        logger.warn('[Square] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.type || parsed.event_type,
      data: parsed.data?.object || parsed.data || parsed,
      timestamp: parsed.created_at || headers['x-square-timestamp'] || new Date().toISOString(),
      webhookId: parsed.event_id || null,
      merchantId: parsed.merchant_id || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook with Square.
   *
   * Note: Square webhook subscriptions are managed through the Square Developer
   * Dashboard or the Webhook Subscriptions API.
   *
   * @param {Object} config - Webhook configuration
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active }
   */
  async registerWebhook(config) {
    const callbackUrl = config.callbackUrl || config;
    const events = config.events || WEBHOOK_EVENTS;

    const payload = {
      subscription: {
        name: 'AccuDefend Dispute Integration',
        notification_url: callbackUrl,
        event_types: events,
        enabled: true,
        api_version: '2024-01-18'
      },
      idempotency_key: this._generateIdempotencyKey('webhook')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/v2/webhooks/subscriptions', payload)
    );

    const subscription = response.data.subscription || response.data;
    logger.info(`[Square] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: subscription.id || subscription.subscription_id,
      callbackUrl,
      events,
      active: subscription.enabled !== false,
      signatureKey: subscription.signature_key || null,
      message: 'Webhook subscription registered successfully'
    };
  }

  // ===========================================================================
  // NORMALIZATION
  // ===========================================================================

  /**
   * Normalize a Square dispute into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute data from Square
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.dispute_id || portalData.id;
    const amount = portalData.amount_money
      ? parseFloat(portalData.amount_money.amount) / 100  // Square uses cents
      : parseFloat(portalData.amount || 0);

    const currency = portalData.amount_money?.currency || portalData.currency || 'USD';
    const reasonCode = portalData.reason || portalData.dispute_reason || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    // Square provides card brand via the card_brand field
    const cardBrand = portalData.card_brand || portalData.brand || 'UNKNOWN';

    return {
      disputeId: id,
      caseNumber: portalData.dispute_id || null,
      amount,
      currency,
      cardLastFour: portalData.card_brand ? '' : '',  // Square masks card info
      cardBrand: cardBrand.toUpperCase(),
      guestName: portalData.cardholder_name || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.created_at || portalData.reported_at,
      dueDate: portalData.due_at || portalData.evidence_due_date || null,
      status: this.normalizeDisputeStatus(portalData.state || portalData.status),
      portalStatus: portalData.state || portalData.status,
      transactionId: portalData.disputed_payment?.payment_id || portalData.payment_id || '',
      transactionDate: portalData.disputed_payment?.created_at || null,
      locationId: portalData.location_id || this.merchantId,
      evidenceIds: portalData.evidence_ids || [],
      portalType: 'SQUARE',
      rawData: portalData
    };
  }

  /**
   * Map a Square dispute state to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_SQUARE[portalStatus.toUpperCase()] || 'PENDING';
  }

  /**
   * Map a Square reason to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase();
    const known = SQUARE_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Square Dispute Reason: ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity with the Square API.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/v2/merchants/me', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Square API is reachable',
        details: {
          portalType: 'SQUARE',
          merchantId: this.merchantId,
          applicationId: this.applicationId,
          apiVersion: '2024-01-18',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Square API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'SQUARE',
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
   * Map AccuDefend evidence types to Square evidence types.
   *
   * @param {string} type - AccuDefend evidence type
   * @returns {string} Square evidence type
   */
  _mapToSquareEvidenceType(type) {
    const typeMap = {
      'folio': 'RECEIPT',
      'receipt': 'RECEIPT',
      'invoice': 'RECEIPT',
      'signed_receipt': 'RECEIPT',
      'guest_registration_card': 'AUTHORIZATION_DOCUMENTATION',
      'signed_agreement': 'AUTHORIZATION_DOCUMENTATION',
      'terms_and_conditions': 'CANCELLATION_OR_REFUND_DOCUMENTATION',
      'cancellation_policy': 'CANCELLATION_OR_REFUND_DOCUMENTATION',
      'refund_policy': 'CANCELLATION_OR_REFUND_DOCUMENTATION',
      'guest_correspondence': 'CARDHOLDER_COMMUNICATION',
      'email_correspondence': 'CARDHOLDER_COMMUNICATION',
      'check_in_confirmation': 'SERVICE_RECEIVED_DOCUMENTATION',
      'proof_of_delivery': 'PROOF_OF_DELIVERY_DOCUMENTATION',
      'delivery_confirmation': 'PROOF_OF_DELIVERY_DOCUMENTATION',
      'id_verification': 'CARDHOLDER_INFORMATION',
      'service_description': 'PRODUCT_OR_SERVICE_DESCRIPTION',
      'booking_confirmation': 'PURCHASE_ACKNOWLEDGEMENT',
      'reservation_confirmation': 'PURCHASE_ACKNOWLEDGEMENT',
      'supporting_document': 'GENERIC_EVIDENCE'
    };

    return typeMap[type] || 'GENERIC_EVIDENCE';
  }
}

module.exports = SquareAdapter;
