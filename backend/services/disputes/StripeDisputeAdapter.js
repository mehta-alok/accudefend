/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Stripe Dispute Adapter
 *
 * Implements two-way integration with Stripe's Disputes API:
 *   - Receive dispute notifications via Stripe webhooks
 *   - Submit compelling evidence using Stripe's evidence object model
 *   - Track dispute lifecycle through Stripe's dispute states
 *   - Close disputes when merchant chooses not to challenge
 *
 * Auth: API Key (Bearer token) via Authorization header.
 * Base URL: https://api.stripe.com (configurable via STRIPE_API_URL env var)
 *
 * Stripe's dispute model is unique in that evidence is submitted as a
 * structured object (not file uploads), with specific fields for different
 * evidence types. Files are first uploaded to Stripe's File API, then
 * referenced by file ID in the evidence object. Stripe also uses idempotency
 * keys on all POST requests.
 *
 * Note: Named StripeDisputeAdapter to avoid conflicts with other Stripe
 * service files in the codebase.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// STRIPE REASON CODE MAPPINGS
// =============================================================================

/**
 * Stripe uses its own dispute reason strings that abstract the underlying
 * card network reason codes.
 */
const STRIPE_REASON_CODES = {
  'bank_cannot_process': { code: 'bank_cannot_process', category: 'PROCESSING_ERROR', description: 'Bank cannot process the transaction' },
  'check_returned': { code: 'check_returned', category: 'PROCESSING_ERROR', description: 'Check returned' },
  'credit_not_processed': { code: 'credit_not_processed', category: 'CONSUMER_DISPUTE', description: 'Credit not processed' },
  'customer_initiated': { code: 'customer_initiated', category: 'CONSUMER_DISPUTE', description: 'Customer-initiated dispute' },
  'debit_not_authorized': { code: 'debit_not_authorized', category: 'FRAUD', description: 'Debit not authorized' },
  'duplicate': { code: 'duplicate', category: 'PROCESSING_ERROR', description: 'Duplicate charge' },
  'fraudulent': { code: 'fraudulent', category: 'FRAUD', description: 'Fraudulent transaction' },
  'general': { code: 'general', category: 'UNKNOWN', description: 'General dispute' },
  'incorrect_account_details': { code: 'incorrect_account_details', category: 'PROCESSING_ERROR', description: 'Incorrect account details' },
  'insufficient_funds': { code: 'insufficient_funds', category: 'PROCESSING_ERROR', description: 'Insufficient funds' },
  'product_not_received': { code: 'product_not_received', category: 'CONSUMER_DISPUTE', description: 'Product/service not received' },
  'product_unacceptable': { code: 'product_unacceptable', category: 'CONSUMER_DISPUTE', description: 'Product/service unacceptable' },
  'subscription_canceled': { code: 'subscription_canceled', category: 'CONSUMER_DISPUTE', description: 'Subscription was cancelled' },
  'unrecognized': { code: 'unrecognized', category: 'FRAUD', description: 'Transaction not recognized by cardholder' }
};

// Stripe dispute status -> AccuDefend internal status
const STATUS_MAP_FROM_STRIPE = {
  'warning_needs_response': 'PENDING',
  'warning_under_review': 'IN_REVIEW',
  'warning_closed': 'RESOLVED',
  'needs_response': 'PENDING',
  'under_review': 'IN_REVIEW',
  'charge_refunded': 'RESOLVED',
  'won': 'WON',
  'lost': 'LOST'
};

// Stripe webhook event types for disputes
const WEBHOOK_EVENTS = [
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'charge.dispute.closed'
];


class StripeDisputeAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey        - Stripe Secret API Key (sk_...)
   * @param {string} config.credentials.merchantId    - Stripe Account ID (for Connect) or internal ref
   * @param {string} [config.credentials.webhookSecret] - Webhook endpoint signing secret (whsec_...)
   * @param {string} [config.credentials.connectAccountId] - Connected account ID (for platforms)
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'STRIPE',
      baseUrl: config.baseUrl || process.env.STRIPE_API_URL || 'https://api.stripe.com'
    });

    this.merchantId = this.credentials.merchantId;
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.connectAccountId = this.credentials.connectAccountId || '';

    // Initialize HTTP client with Stripe API Key auth
    // Stripe uses form-encoded bodies for most endpoints
    const headers = {
      'Authorization': `Bearer ${this.credentials.apiKey}`,
      'Stripe-Version': '2024-04-10'
    };

    if (this.connectAccountId) {
      headers['Stripe-Account'] = this.connectAccountId;
    }

    this._initHttpClient(headers);
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Stripe by validating the API key.
   * Stripe uses secret key-based Bearer token authentication.
   *
   * @returns {Promise<Object>} { authenticated: boolean, merchantId, message }
   */
  async authenticate() {
    try {
      // Verify API key by fetching account info
      const response = await this._withRetry(() =>
        this.httpClient.get('/v1/account')
      );

      const account = response.data;
      logger.info(`[Stripe] Authentication successful for account ${account.id}`);

      return {
        authenticated: true,
        merchantId: account.id,
        businessName: account.business_profile?.name || account.settings?.dashboard?.display_name,
        country: account.country,
        chargesEnabled: account.charges_enabled,
        message: 'Successfully authenticated with Stripe API'
      };
    } catch (error) {
      logger.error(`[Stripe] Authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `Authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Stripe
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from Stripe.
   *
   * @param {Object} disputeData - Raw dispute data from Stripe
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    const dispute = disputeData.dispute || disputeData;
    logger.info(`[Stripe] Receiving dispute: ${dispute.id}`);

    const normalized = this.normalizeDispute(dispute);

    logger.info(`[Stripe] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to Stripe for a dispute.
   *
   * Stripe evidence submission is a two-step process:
   *   1. Upload files via POST /v1/files (returns file IDs)
   *   2. Update the dispute with evidence fields and file IDs
   *
   * @param {string} disputeId - Stripe dispute identifier (dp_...)
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};
    const uploadedFileIds = {};

    // Step 1: Upload files to Stripe's File API
    for (const file of files) {
      const fileCategory = this._mapToStripeFileCategory(file.type);

      // Stripe file upload uses multipart form data
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('purpose', 'dispute_evidence');
      formData.append('file', file.data instanceof Buffer ? file.data : Buffer.from(file.data, 'base64'), {
        filename: file.fileName,
        contentType: file.mimeType || 'application/pdf'
      });

      const fileResponse = await this._withRetry(() =>
        this.httpClient.post('/v1/files', formData, {
          headers: {
            ...formData.getHeaders()
          }
        })
      );

      const fileId = fileResponse.data.id;
      uploadedFileIds[fileCategory] = fileId;
      logger.info(`[Stripe] File uploaded: ${fileId} (${file.fileName})`);
    }

    // Step 2: Submit evidence by updating the dispute
    const evidencePayload = this._buildStripeEvidencePayload(metadata, uploadedFileIds);

    const response = await this._withRetry(() =>
      this.httpClient.post(`/v1/disputes/${disputeId}`, new URLSearchParams(evidencePayload).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );

    logger.info(`[Stripe] Evidence submitted for dispute ${disputeId}`);

    return {
      submissionId: disputeId,
      status: response.data.status || 'under_review',
      message: 'Evidence submitted successfully',
      fileIds: uploadedFileIds,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Query Stripe for the current status of a dispute.
   *
   * @param {string} disputeId - Stripe dispute identifier (dp_...)
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/v1/disputes/${disputeId}`)
    );

    const dispute = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(dispute.status),
      portalStatus: dispute.status,
      lastUpdated: dispute.created ? new Date(dispute.created * 1000).toISOString() : null,
      notes: dispute.evidence?.uncategorized_text || '',
      outcome: dispute.status === 'won' ? 'won' : dispute.status === 'lost' ? 'lost' : null,
      outcomeDate: (dispute.status === 'won' || dispute.status === 'lost')
        ? new Date(dispute.created * 1000).toISOString() : null,
      dueDate: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null,
      hasEvidence: dispute.evidence_details?.has_evidence || false,
      submissionCount: dispute.evidence_details?.submission_count || 0
    };
  }

  /**
   * Push a representment response to Stripe by submitting evidence and
   * optionally finalizing the submission.
   *
   * In Stripe, submitting evidence with submit=true makes the evidence final
   * and cannot be changed.
   *
   * @param {string} disputeId - Stripe dispute identifier (dp_...)
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    const evidenceFields = {
      'evidence[customer_name]': responseData.guestDetails?.name || '',
      'evidence[customer_email_address]': responseData.guestDetails?.email || '',
      'evidence[customer_purchase_ip]': responseData.compellingEvidence?.deviceInfo?.ipAddress || '',
      'evidence[service_date]': responseData.stayDetails?.checkInDate || '',
      'evidence[service_documentation]': responseData.stayDetails?.confirmationNumber || '',
      'evidence[uncategorized_text]': responseData.narrative || responseData.compellingEvidence?.description || '',
      'submit': 'true'
    };

    // Add evidence file IDs if provided
    if (responseData.evidenceIds?.length > 0) {
      // Map evidence IDs to the appropriate Stripe evidence fields
      responseData.evidenceIds.forEach((id, index) => {
        if (index === 0) evidenceFields['evidence[uncategorized_file]'] = id;
      });
    }

    // Remove empty values
    Object.keys(evidenceFields).forEach(key => {
      if (!evidenceFields[key]) delete evidenceFields[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.post(`/v1/disputes/${disputeId}`, new URLSearchParams(evidenceFields).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );

    logger.info(`[Stripe] Response submitted for dispute ${disputeId} (finalized)`);

    return {
      responseId: disputeId,
      status: response.data.status || 'under_review',
      message: 'Dispute evidence submitted and finalized',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close a dispute (accept liability / do not challenge).
   *
   * @param {string} disputeId - Stripe dispute identifier (dp_...)
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.post(`/v1/disputes/${disputeId}/close`)
    );

    logger.info(`[Stripe] Dispute ${disputeId} closed (accepted)`);

    return {
      accepted: true,
      disputeId,
      status: response.data.status || 'lost',
      message: response.data.message || 'Dispute closed (liability accepted)'
    };
  }

  /**
   * Fetch a paginated list of disputes from Stripe.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    const queryParams = {};

    if (params.since) {
      queryParams['created[gte]'] = Math.floor(new Date(params.since).getTime() / 1000);
    }
    if (params.limit) {
      queryParams.limit = Math.min(params.limit, 100);
    } else {
      queryParams.limit = 50;
    }
    if (params.startingAfter) {
      queryParams.starting_after = params.startingAfter;
    }

    const response = await this._withRetry(() =>
      this.httpClient.get('/v1/disputes', { params: queryParams })
    );

    const data = response.data;
    const disputes = data.data || [];

    return {
      disputes: disputes.map((d) => this.normalizeDispute(d)),
      totalCount: data.total_count || disputes.length,
      hasMore: data.has_more || false,
      page: params.page || 1
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Stripe webhook payload.
   *
   * Stripe sends webhooks with a specific structure:
   *   { id, object: 'event', type, data: { object: {...} }, created, ... }
   *
   * Signature verification uses the Stripe-Signature header with HMAC-SHA256.
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
        logger.error('[Stripe] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Stripe webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Stripe] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Stripe webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify Stripe webhook signature
    const sigHeader = headers['stripe-signature'] || headers['Stripe-Signature'];
    if (this.webhookSecret && sigHeader) {
      const isValid = this._verifyStripeSignature(rawBody, sigHeader, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Stripe] Webhook signature verification failed');
        throw new Error('Invalid Stripe webhook signature');
      }
    }

    return {
      event: parsed.type,
      data: parsed.data?.object || parsed.data || parsed,
      timestamp: parsed.created
        ? new Date(parsed.created * 1000).toISOString()
        : new Date().toISOString(),
      webhookId: parsed.id || null,
      apiVersion: parsed.api_version || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook endpoint with Stripe.
   *
   * @param {Object} config - Webhook configuration
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    const callbackUrl = config.callbackUrl || config;
    const events = config.events || WEBHOOK_EVENTS;

    const payload = new URLSearchParams();
    payload.append('url', callbackUrl);
    events.forEach(e => payload.append('enabled_events[]', e));

    if (this.connectAccountId) {
      payload.append('connect', 'true');
    }

    const response = await this._withRetry(() =>
      this.httpClient.post('/v1/webhook_endpoints', payload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );

    const endpoint = response.data;
    logger.info(`[Stripe] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: endpoint.id,
      callbackUrl,
      events,
      active: endpoint.status === 'enabled',
      secret: endpoint.secret || null,
      message: 'Webhook endpoint registered successfully'
    };
  }

  // ===========================================================================
  // NORMALIZATION
  // ===========================================================================

  /**
   * Normalize a Stripe dispute into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute data from Stripe
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.id;
    const amount = portalData.amount ? portalData.amount / 100 : 0; // Stripe uses cents
    const currency = (portalData.currency || 'usd').toUpperCase();

    const reasonCode = portalData.reason || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    // Extract card info from the charge or payment_intent
    const charge = portalData.charge || {};
    const paymentMethod = charge.payment_method_details?.card || {};

    return {
      disputeId: id,
      caseNumber: portalData.id,
      amount,
      currency,
      cardLastFour: paymentMethod.last4 || portalData.card_last4 || '',
      cardBrand: (paymentMethod.brand || portalData.card_brand || 'UNKNOWN').toUpperCase(),
      guestName: portalData.evidence?.customer_name || charge.billing_details?.name || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.created
        ? new Date(portalData.created * 1000).toISOString() : null,
      dueDate: portalData.evidence_details?.due_by
        ? new Date(portalData.evidence_details.due_by * 1000).toISOString() : null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      isEarlyWarning: portalData.status?.startsWith('warning_') || false,
      transactionId: typeof charge === 'string' ? charge : charge.id || '',
      transactionDate: charge.created
        ? new Date(charge.created * 1000).toISOString() : null,
      paymentIntentId: portalData.payment_intent || '',
      hasEvidence: portalData.evidence_details?.has_evidence || false,
      submissionCount: portalData.evidence_details?.submission_count || 0,
      portalType: 'STRIPE',
      rawData: portalData
    };
  }

  /**
   * Map a Stripe dispute status to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_STRIPE[portalStatus] || 'PENDING';
  }

  /**
   * Map a Stripe reason to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toLowerCase();
    const known = STRIPE_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Stripe Dispute Reason: ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity with the Stripe API.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/v1/account', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Stripe API is reachable',
        details: {
          portalType: 'STRIPE',
          accountId: response.data.id,
          chargesEnabled: response.data.charges_enabled,
          apiVersion: '2024-04-10',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Stripe API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'STRIPE',
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
   * Verify a Stripe webhook signature.
   *
   * Stripe uses a timestamp + HMAC-SHA256 scheme:
   *   Stripe-Signature: t=timestamp,v1=signature
   *
   * @param {string} rawBody - Raw request body string
   * @param {string} sigHeader - Stripe-Signature header value
   * @param {string} secret - Webhook endpoint secret
   * @returns {boolean} True if signature is valid
   */
  _verifyStripeSignature(rawBody, sigHeader, secret) {
    try {
      const parts = sigHeader.split(',').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key.trim()] = value;
        return acc;
      }, {});

      const timestamp = parts.t;
      const signature = parts.v1;

      if (!timestamp || !signature) return false;

      // Check timestamp is within tolerance (5 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
        logger.warn('[Stripe] Webhook timestamp outside tolerance window');
        return false;
      }

      const signedPayload = `${timestamp}.${rawBody}`;
      const expectedSignature = crypto.createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf-8'),
        Buffer.from(expectedSignature, 'utf-8')
      );
    } catch (error) {
      logger.error('[Stripe] Error verifying webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Map AccuDefend evidence types to Stripe file evidence categories.
   *
   * @param {string} type - AccuDefend evidence type
   * @returns {string} Stripe evidence field name
   */
  _mapToStripeFileCategory(type) {
    const typeMap = {
      'folio': 'receipt',
      'receipt': 'receipt',
      'invoice': 'receipt',
      'signed_receipt': 'receipt',
      'guest_registration_card': 'customer_signature',
      'signed_agreement': 'customer_signature',
      'check_in_confirmation': 'service_documentation',
      'proof_of_delivery': 'shipping_documentation',
      'delivery_confirmation': 'shipping_documentation',
      'guest_correspondence': 'customer_communication',
      'email_correspondence': 'customer_communication',
      'cancellation_policy': 'cancellation_policy',
      'refund_policy': 'refund_policy',
      'terms_and_conditions': 'cancellation_policy',
      'id_verification': 'customer_signature',
      'supporting_document': 'uncategorized_file'
    };

    return typeMap[type] || 'uncategorized_file';
  }

  /**
   * Build the Stripe evidence payload from metadata and uploaded file IDs.
   *
   * @param {Object} metadata - Evidence metadata
   * @param {Object} uploadedFileIds - Map of evidence category -> Stripe file ID
   * @returns {Object} Flat key-value pairs for URL-encoded submission
   */
  _buildStripeEvidencePayload(metadata, uploadedFileIds) {
    const payload = {};

    // Text evidence fields
    if (metadata.guestName) payload['evidence[customer_name]'] = metadata.guestName;
    if (metadata.email) payload['evidence[customer_email_address]'] = metadata.email;
    if (metadata.confirmationNumber) payload['evidence[service_documentation]'] = metadata.confirmationNumber;
    if (metadata.checkInDate) payload['evidence[service_date]'] = metadata.checkInDate;
    if (metadata.notes) payload['evidence[uncategorized_text]'] = metadata.notes;
    if (metadata.cancellationPolicy) payload['evidence[cancellation_policy_disclosure]'] = metadata.cancellationPolicy;
    if (metadata.refundPolicy) payload['evidence[refund_policy_disclosure]'] = metadata.refundPolicy;

    // File evidence fields
    for (const [category, fileId] of Object.entries(uploadedFileIds)) {
      payload[`evidence[${category}]`] = fileId;
    }

    return payload;
  }
}

module.exports = StripeDisputeAdapter;
