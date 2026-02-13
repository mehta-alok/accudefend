/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Verifi (Visa CDRN) Dispute Adapter
 *
 * Implements two-way integration with Visa's Verifi platform:
 *   - CDRN (Cardholder Dispute Resolution Network): Early dispute notifications
 *     that arrive before a formal chargeback is filed, giving merchants a window
 *     to resolve or accept the dispute pre-chargeback.
 *   - RDR (Rapid Dispute Resolution): Auto-resolve qualifying disputes using
 *     merchant-defined rules, preventing them from escalating to chargebacks.
 *   - Order Insight: Provide transaction and order details directly to issuers
 *     so they can share them with cardholders inquiring about a charge.
 *
 * Auth: API Key + Merchant ID + Card Acceptor ID sent in request headers.
 * Base URL: https://api.verifi.com/v3 (configurable via VERIFI_API_URL env var)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// VISA REASON CODE MAPPINGS
// =============================================================================

/**
 * Visa uses a two-part numeric reason code system (Condition XX.Y).
 * Category 10 = Fraud, Category 13 = Consumer Disputes.
 */
const VISA_REASON_CODES = {
  '10.1': {
    code: '10.1',
    category: 'FRAUD',
    description: 'EMV Liability Shift Counterfeit Fraud',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'terminal_capability']
  },
  '10.2': {
    code: '10.2',
    category: 'FRAUD',
    description: 'EMV Liability Shift Non-Counterfeit Fraud',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'terminal_capability']
  },
  '10.3': {
    code: '10.3',
    category: 'FRAUD',
    description: 'Other Fraud - Card-Present Environment',
    compellingEvidenceTypes: ['signed_receipt', 'chip_read_log', 'surveillance']
  },
  '10.4': {
    code: '10.4',
    category: 'FRAUD',
    description: 'Other Fraud - Card-Absent Environment',
    compellingEvidenceTypes: [
      'avs_cvv_match', 'delivery_confirmation', 'device_fingerprint',
      'ip_address_match', 'prior_undisputed_transactions'
    ]
  },
  '10.5': {
    code: '10.5',
    category: 'FRAUD',
    description: 'Visa Fraud Monitoring Program',
    compellingEvidenceTypes: ['transaction_receipt', 'proof_of_delivery']
  },
  '13.1': {
    code: '13.1',
    category: 'CONSUMER_DISPUTE',
    description: 'Merchandise/Services Not Received',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'guest_registration_card', 'id_verification'
    ]
  },
  '13.2': {
    code: '13.2',
    category: 'CONSUMER_DISPUTE',
    description: 'Cancelled Recurring Transaction',
    compellingEvidenceTypes: ['terms_and_conditions', 'cancellation_policy', 'signed_agreement']
  },
  '13.3': {
    code: '13.3',
    category: 'CONSUMER_DISPUTE',
    description: 'Not as Described or Defective Merchandise/Services',
    compellingEvidenceTypes: [
      'service_description', 'terms_accepted', 'guest_correspondence',
      'folio', 'quality_documentation'
    ]
  },
  '13.6': {
    code: '13.6',
    category: 'CONSUMER_DISPUTE',
    description: 'Credit Not Processed',
    compellingEvidenceTypes: [
      'refund_policy', 'terms_and_conditions', 'no_refund_entitlement',
      'credit_issued_proof'
    ]
  },
  '13.7': {
    code: '13.7',
    category: 'CONSUMER_DISPUTE',
    description: 'Cancelled Merchandise/Services',
    compellingEvidenceTypes: [
      'cancellation_policy', 'no_show_documentation', 'terms_accepted',
      'guest_folio', 'reservation_confirmation'
    ]
  }
};

// Verifi portal status -> AccuDefend internal status
const STATUS_MAP_FROM_VERIFI = {
  'new': 'PENDING',
  'pending': 'PENDING',
  'under_review': 'IN_REVIEW',
  'in_progress': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// AccuDefend status -> Verifi portal status
const STATUS_MAP_TO_VERIFI = {
  'PENDING': 'pending',
  'IN_REVIEW': 'under_review',
  'SUBMITTED': 'responded',
  'WON': 'won',
  'LOST': 'lost',
  'EXPIRED': 'expired'
};

// Verifi webhook event types that we subscribe to
const WEBHOOK_EVENTS = [
  'alert.created',
  'alert.updated',
  'dispute.created',
  'dispute.resolved',
  'rdr.resolved'
];


class VerifiAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey         - Verifi API Key
   * @param {string} config.credentials.merchantId     - Visa Merchant ID
   * @param {string} config.credentials.cardAcceptorId - Card Acceptor ID (CAID)
   * @param {string} [config.credentials.descriptor]   - Merchant descriptor for matching
   * @param {boolean} [config.credentials.rdrEnabled]  - Whether RDR auto-resolve is active
   * @param {string} [config.baseUrl]                  - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'VERIFI',
      baseUrl: config.baseUrl || process.env.VERIFI_API_URL || 'https://api.verifi.com/v3'
    });

    this.merchantId = this.credentials.merchantId;
    this.cardAcceptorId = this.credentials.cardAcceptorId;
    this.descriptor = this.credentials.descriptor || '';
    this.rdrEnabled = this.credentials.rdrEnabled || false;

    // Initialize HTTP client with Verifi-specific auth headers
    this._initHttpClient({
      'X-API-Key': this.credentials.apiKey,
      'X-Merchant-ID': this.merchantId,
      'X-Card-Acceptor-ID': this.cardAcceptorId
    });
  }

  // ===========================================================================
  // INBOUND: Receive FROM Verifi
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from Verifi (via webhook or poll).
   * Handles both CDRN alerts and formal disputes.
   */
  async receiveDispute(disputePayload) {
    logger.info(`[Verifi] Receiving dispute: ${disputePayload.alertId || disputePayload.disputeId}`);

    const normalized = this.normalizeDispute(disputePayload);

    logger.info(`[Verifi] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Query Verifi for the current status of a dispute.
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/disputes/${disputeId}/status`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.lastUpdated || data.updatedAt,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null
    };
  }

  /**
   * Retrieve evidence requirements for a Verifi dispute.
   * Combines Verifi's requirements with our reason-code-based knowledge.
   */
  async getEvidenceRequirements(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/disputes/${disputeId}`)
    );

    const dispute = response.data;
    const reasonInfo = VISA_REASON_CODES[dispute.reasonCode] || {};

    // Merge portal-required types with our reason-code-specific types
    const portalRequired = dispute.requiredEvidenceTypes || [];
    const reasonRequired = reasonInfo.compellingEvidenceTypes || [];
    const allRequired = [...new Set([...portalRequired, ...reasonRequired])];

    return {
      disputeId,
      requiredTypes: allRequired,
      portalRequiredTypes: portalRequired,
      recommendedTypes: reasonRequired,
      deadline: dispute.responseDeadline || dispute.dueDate,
      instructions: dispute.evidenceInstructions || this._getDefaultEvidenceInstructions(dispute.reasonCode),
      reasonCode: dispute.reasonCode,
      reasonCategory: reasonInfo.category || 'UNKNOWN'
    };
  }

  /**
   * Fetch a paginated list of pending CDRN alerts from Verifi.
   */
  async fetchDisputes(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || 'pending',
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100)
    };

    // Remove undefined values so axios doesn't send "undefined" strings
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/alerts', { params: queryParams })
    );

    const data = response.data;
    const alerts = data.alerts || data.data || [];

    return {
      disputes: alerts.map((alert) => this.normalizeDispute(alert)),
      totalCount: data.totalCount || data.total || alerts.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  /**
   * Fetch details of a single CDRN alert by ID.
   */
  async getAlertDetails(alertId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/alerts/${alertId}`)
    );

    return this.normalizeDispute(response.data);
  }

  // ===========================================================================
  // OUTBOUND: Send TO Verifi
  // ===========================================================================

  /**
   * Submit a compelling evidence package to Verifi for a dispute.
   *
   * Verifi expects evidence as multipart form data with typed documents
   * and a metadata JSON section describing the guest stay and transaction.
   */
  async submitEvidence(disputeId, evidencePackage) {
    const files = evidencePackage.files || [];
    const metadata = evidencePackage.metadata || {};

    // Build the Verifi-specific evidence payload
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      cardAcceptorId: this.cardAcceptorId,
      evidenceCategory: metadata.evidenceCategory || 'compelling_evidence',
      compellingEvidenceType: metadata.compellingEvidenceType || 'generic',
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
        transactionId: metadata.transactionId
      },
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[Verifi] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Verifi for a dispute.
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
      this.httpClient.post(`/alerts/${disputeId}/respond`, payload)
    );

    logger.info(`[Verifi] Response submitted for dispute ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a CDRN alert (do not fight it).
   * Accepting a CDRN alert triggers an automatic credit to the cardholder.
   */
  async acceptDispute(disputeId) {
    const payload = {
      alertId: disputeId,
      merchantId: this.merchantId,
      action: 'accept',
      merchantNotes: 'Liability accepted by merchant',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/alerts/${disputeId}/respond`, payload)
    );

    logger.info(`[Verifi] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  /**
   * Update the status of a dispute case on Verifi.
   */
  async updateCaseStatus(disputeId, status, notes = '') {
    const verifiStatus = STATUS_MAP_TO_VERIFI[status] || status;

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/evidence`, {
        disputeId,
        merchantId: this.merchantId,
        statusUpdate: verifiStatus,
        notes,
        updatedAt: new Date().toISOString()
      })
    );

    logger.info(`[Verifi] Case ${disputeId} status updated to ${verifiStatus}`);

    return {
      disputeId,
      status: verifiStatus,
      message: response.data.message || 'Status updated',
      timestamp: new Date().toISOString()
    };
  }

  // ===========================================================================
  // RDR (Rapid Dispute Resolution)
  // ===========================================================================

  /**
   * Attempt to auto-resolve a dispute via Visa's RDR program.
   *
   * RDR allows merchants to set rules that automatically resolve qualifying
   * disputes pre-chargeback. The merchant agrees to credit the cardholder
   * if the dispute meets certain criteria (amount thresholds, reason codes, etc.).
   *
   * @param {Object} rdrRequest
   * @param {string} rdrRequest.alertId - CDRN alert ID
   * @param {number} rdrRequest.amount - Transaction amount
   * @param {string} rdrRequest.reasonCode - Visa reason code
   * @param {string} rdrRequest.cardLastFour - Last 4 digits of card
   * @param {Object} [rdrRequest.rules] - Override RDR rules for this request
   * @returns {Promise<Object>} { resolved, rdrId, action, amount, message }
   */
  async resolveViaRDR(rdrRequest) {
    if (!this.rdrEnabled) {
      logger.warn('[Verifi] RDR is not enabled for this merchant');
      return {
        resolved: false,
        message: 'RDR is not enabled. Enable it in integration settings.'
      };
    }

    const payload = {
      alertId: rdrRequest.alertId,
      merchantId: this.merchantId,
      cardAcceptorId: this.cardAcceptorId,
      transactionAmount: rdrRequest.amount,
      reasonCode: rdrRequest.reasonCode,
      cardLastFour: rdrRequest.cardLastFour,
      rdrRules: rdrRequest.rules || {
        autoAcceptBelow: rdrRequest.autoAcceptBelow || null,
        excludeReasonCodes: rdrRequest.excludeReasonCodes || [],
        requireReview: rdrRequest.requireReview || false
      },
      idempotencyKey: this._generateIdempotencyKey('rdr')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/rdr/resolve', payload)
    );

    const result = response.data;

    logger.info(
      `[Verifi] RDR resolution for alert ${rdrRequest.alertId}: ` +
      `${result.resolved ? 'AUTO-RESOLVED' : 'NOT RESOLVED'} (${result.action || 'none'})`
    );

    return {
      resolved: result.resolved || false,
      rdrId: result.rdrId || result.id,
      action: result.action || null,
      amount: result.creditAmount || rdrRequest.amount,
      message: result.message || (result.resolved ? 'Dispute auto-resolved via RDR' : 'RDR did not resolve'),
      timestamp: result.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // ORDER INSIGHT
  // ===========================================================================

  /**
   * Provide transaction/order details to Verifi's Order Insight platform.
   *
   * Order Insight allows issuers to display merchant-provided transaction data
   * to cardholders who inquire about a charge, potentially preventing a dispute
   * from being filed at all.
   *
   * @param {Object} orderData
   * @param {string} orderData.transactionId - Original transaction ID
   * @param {string} orderData.descriptor - Merchant descriptor that appears on statement
   * @param {Object} orderData.orderDetails - Full order/reservation details
   * @returns {Promise<Object>}
   */
  async submitOrderInsight(orderData) {
    const payload = {
      merchantId: this.merchantId,
      cardAcceptorId: this.cardAcceptorId,
      transactionId: orderData.transactionId,
      merchantDescriptor: orderData.descriptor || this.descriptor,
      orderDetails: {
        orderType: 'hotel_reservation',
        confirmationNumber: orderData.orderDetails.confirmationNumber,
        guestName: orderData.orderDetails.guestName,
        checkInDate: orderData.orderDetails.checkInDate,
        checkOutDate: orderData.orderDetails.checkOutDate,
        propertyName: orderData.orderDetails.propertyName,
        propertyAddress: orderData.orderDetails.propertyAddress,
        roomType: orderData.orderDetails.roomType,
        totalAmount: orderData.orderDetails.totalAmount,
        currency: orderData.orderDetails.currency || 'USD',
        itemizedCharges: orderData.orderDetails.itemizedCharges || [],
        cancellationPolicy: orderData.orderDetails.cancellationPolicy || '',
        bookingSource: orderData.orderDetails.bookingSource || 'direct'
      }
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/order-insight/submit', payload)
    );

    logger.info(`[Verifi] Order Insight submitted for transaction ${orderData.transactionId}`);

    return {
      insightId: response.data.insightId || response.data.id,
      status: response.data.status || 'accepted',
      message: response.data.message || 'Order insight submitted'
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Verifi webhook payload.
   *
   * Verifi sends webhooks as JSON with the following top-level structure:
   *   { event: string, data: object, timestamp: string, webhookId: string }
   */
  parseWebhookPayload(rawPayload, headers) {
    let parsed;

    if (typeof rawPayload === 'string') {
      try {
        parsed = JSON.parse(rawPayload);
      } catch (err) {
        logger.error('[Verifi] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Verifi webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(rawPayload)) {
      try {
        parsed = JSON.parse(rawPayload.toString('utf-8'));
      } catch (err) {
        logger.error('[Verifi] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Verifi webhook payload: not valid JSON');
      }
    } else {
      parsed = rawPayload;
    }

    return {
      event: parsed.event || parsed.eventType,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-verifi-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-verifi-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Verify the signature of a Verifi webhook payload.
   *
   * Verifi signs webhooks using HMAC-SHA256 with the webhook secret.
   * The signature is sent in the X-Verifi-Signature header.
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    if (!signature || !secret) {
      logger.warn('[Verifi] Webhook signature verification skipped: missing signature or secret');
      return false;
    }

    const payload = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    return this._verifySignature(payload, signature, secret);
  }

  /**
   * Register a webhook callback URL with Verifi for receiving event notifications.
   */
  async registerWebhook(callbackUrl, events = WEBHOOK_EVENTS) {
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      version: 'v3'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[Verifi] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a Verifi dispute/alert into AccuDefend's standard format.
   *
   * Verifi payloads may come as CDRN alerts (pre-chargeback) or formal disputes.
   * This method handles both shapes.
   */
  normalizeDispute(portalData) {
    // Handle both alert and dispute payload shapes
    const id = portalData.disputeId || portalData.alertId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.conditionCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedCardNumber?.slice(-4) || '',
      cardBrand: 'VISA',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.alertDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      alertType: portalData.alertType || (portalData.alertId ? 'CDRN' : 'DISPUTE'),
      isPreChargeback: !!portalData.alertId,
      transactionId: portalData.transactionId || portalData.acquirerReferenceNumber || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'VERIFI',
      rawData: portalData
    };
  }

  /**
   * Map a Verifi status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_VERIFI[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Visa reason code to a structured object with category and description.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = VISA_REASON_CODES[normalized];

    if (known) {
      return {
        code: known.code,
        category: known.category,
        description: known.description
      };
    }

    // Attempt to categorize unknown codes by prefix
    if (normalized.startsWith('10.')) {
      return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    }
    if (normalized.startsWith('11.')) {
      return { code: normalized, category: 'AUTHORIZATION', description: `Visa Authorization - Code ${normalized}` };
    }
    if (normalized.startsWith('12.')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Visa Processing Error - Code ${normalized}` };
    }
    if (normalized.startsWith('13.')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Visa Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify that we can communicate with the Verifi API.
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/ping', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Verifi API is reachable',
        details: {
          portalType: 'VERIFI',
          merchantId: this.merchantId,
          cardAcceptorId: this.cardAcceptorId,
          rdrEnabled: this.rdrEnabled,
          apiVersion: 'v3',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Verifi API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'VERIFI',
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
   * Return default evidence instructions based on the Visa reason code.
   * Used when the portal does not provide specific instructions.
   */
  _getDefaultEvidenceInstructions(reasonCode) {
    const instructions = {
      '10.4': 'Provide compelling evidence of a valid card-not-present transaction: ' +
              'AVS/CVV match confirmation, device fingerprint, IP address logs, ' +
              'and at least two prior undisputed transactions from the same device/IP.',
      '13.1': 'Provide proof that the guest received the services: ' +
              'check-in confirmation, signed registration card, room folio, ' +
              'key card access logs, or ID verification records.',
      '13.2': 'Provide evidence that the recurring charge was authorized: ' +
              'signed agreement with cancellation terms, proof that cancellation ' +
              'policy was disclosed and accepted.',
      '13.3': 'Provide evidence that services were provided as described: ' +
              'booking confirmation showing room type and amenities, guest folio, ' +
              'and any correspondence with the guest.',
      '13.6': 'Provide evidence that a credit is not owed or has already been issued: ' +
              'refund policy accepted by the guest, proof that no cancellation ' +
              'was received, or proof of credit already processed.',
      '13.7': 'Provide evidence for cancelled reservation disputes: ' +
              'cancellation policy accepted at booking, no-show documentation, ' +
              'guest folio, and reservation confirmation with terms.'
    };

    return instructions[reasonCode] ||
      'Submit all available evidence including guest folio, signed registration, ' +
      'booking confirmation, correspondence, and any other compelling documentation.';
  }
}

module.exports = VerifiAdapter;
