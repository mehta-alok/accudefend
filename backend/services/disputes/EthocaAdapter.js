/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Ethoca (Mastercard) Dispute Adapter
 *
 * Implements two-way integration with Mastercard's Ethoca platform:
 *   - Ethoca Alerts: Real-time chargeback notifications sent by issuing banks
 *     through the Ethoca collaboration network. Alerts give merchants a short
 *     window to issue a refund and prevent a formal chargeback.
 *   - Consumer Clarity: Enrich transaction data for issuing banks so they can
 *     share order details (confirmation number, check-in/out dates, folio) with
 *     the cardholder during an inquiry, often preventing disputes entirely.
 *   - Eliminator: Automatically resolve disputes when compelling evidence is
 *     matched to a transaction, preventing escalation.
 *
 * Auth: API Key + Merchant ID sent in request headers.
 * Base URL: https://api.ethoca.com/v2 (configurable via ETHOCA_API_URL env var)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// MASTERCARD REASON CODE MAPPINGS
// =============================================================================

/**
 * Mastercard uses numeric reason codes in the 4800 series.
 * Each code maps to a specific dispute category and required evidence types.
 */
const MASTERCARD_REASON_CODES = {
  '4837': {
    code: '4837',
    category: 'FRAUD',
    description: 'No Cardholder Authorization',
    compellingEvidenceTypes: [
      'signed_receipt', 'chip_read_log', 'avs_cvv_match',
      'id_verification', 'device_fingerprint', 'ip_address_log'
    ]
  },
  '4853': {
    code: '4853',
    category: 'CONSUMER_DISPUTE',
    description: 'Cardholder Dispute - Not as Described or Defective',
    compellingEvidenceTypes: [
      'service_description', 'terms_accepted', 'guest_correspondence',
      'folio', 'booking_confirmation', 'quality_documentation'
    ]
  },
  '4855': {
    code: '4855',
    category: 'CONSUMER_DISPUTE',
    description: 'Goods or Services Not Provided',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'guest_registration_card', 'key_card_access_log', 'id_verification'
    ]
  },
  '4860': {
    code: '4860',
    category: 'CONSUMER_DISPUTE',
    description: 'Credit Not Processed',
    compellingEvidenceTypes: [
      'refund_policy', 'terms_and_conditions', 'no_refund_entitlement',
      'credit_issued_proof', 'cancellation_policy'
    ]
  },
  '4863': {
    code: '4863',
    category: 'CONSUMER_DISPUTE',
    description: 'Cardholder Does Not Recognize Transaction',
    compellingEvidenceTypes: [
      'signed_receipt', 'booking_confirmation', 'guest_registration_card',
      'folio', 'merchant_descriptor_match', 'correspondence'
    ]
  }
};

// Ethoca portal status -> AccuDefend internal status
const STATUS_MAP_FROM_ETHOCA = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'investigating': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'in_progress': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'resolved_merchant': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'resolved_issuer': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'auto_resolved': 'WON'
};

// AccuDefend status -> Ethoca portal status
const STATUS_MAP_TO_ETHOCA = {
  'PENDING': 'open',
  'IN_REVIEW': 'investigating',
  'SUBMITTED': 'responded',
  'WON': 'resolved_merchant',
  'LOST': 'resolved_issuer',
  'EXPIRED': 'expired'
};

// Ethoca webhook event types that we subscribe to
const WEBHOOK_EVENTS = [
  'alert.new',
  'alert.updated',
  'dispute.opened',
  'dispute.closed',
  'clarity.requested'
];

// Ethoca alert outcome types
const ALERT_OUTCOMES = {
  REFUND: 'refund',
  STOP_RECURRING: 'stop_recurring',
  ALREADY_REFUNDED: 'already_refunded',
  NO_ACTION: 'no_action',
  FIGHT: 'fight'
};


class EthocaAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Ethoca API Key
   * @param {string} config.credentials.merchantId   - Ethoca Merchant ID
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook signatures
   * @param {string[]} [config.credentials.alertTypes]  - Alert types to subscribe to
   * @param {string} [config.baseUrl]                - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'ETHOCA',
      baseUrl: config.baseUrl || process.env.ETHOCA_API_URL || 'https://api.ethoca.com/v2'
    });

    this.merchantId = this.credentials.merchantId;
    this.webhookSecret = this.credentials.webhookSecret || null;
    this.alertTypes = this.credentials.alertTypes || ['fraud', 'consumer_dispute'];

    // Initialize HTTP client with Ethoca-specific auth headers
    this._initHttpClient({
      'X-API-Key': this.credentials.apiKey,
      'X-Merchant-ID': this.merchantId
    });
  }

  // ===========================================================================
  // INBOUND: Receive FROM Ethoca
  // ===========================================================================

  /**
   * Receive and normalize a dispute/alert payload from Ethoca.
   *
   * Ethoca alerts arrive when an issuing bank opens a case against a merchant
   * transaction. The merchant has a limited window (typically 24-72 hours)
   * to respond with a refund or evidence.
   */
  async receiveDispute(disputePayload) {
    logger.info(`[Ethoca] Receiving alert: ${disputePayload.alertId || disputePayload.disputeId}`);

    const normalized = this.normalizeDispute(disputePayload);

    logger.info(
      `[Ethoca] Alert normalized: ${normalized.disputeId} ` +
      `(${normalized.reasonCode} - ${normalized.reasonDescription})`
    );

    return normalized;
  }

  /**
   * Query Ethoca for the current status of a dispute.
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
      lastUpdated: data.lastUpdated || data.updatedAt,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || data.resolvedAt || null,
      issuerName: data.issuerName || null
    };
  }

  /**
   * Retrieve evidence requirements for an Ethoca dispute.
   */
  async getEvidenceRequirements(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/disputes/${disputeId}`)
    );

    const dispute = response.data;
    const reasonInfo = MASTERCARD_REASON_CODES[dispute.reasonCode] || {};

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
      reasonCategory: reasonInfo.category || 'UNKNOWN',
      issuerName: dispute.issuerName || null
    };
  }

  /**
   * Fetch a paginated list of pending Ethoca alerts.
   */
  async fetchDisputes(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || 'open',
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100),
      alertType: params.alertType || undefined
    };

    // Remove undefined values
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
   * Fetch details of a single Ethoca alert by ID.
   */
  async getAlertDetails(alertId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/alerts/${alertId}`)
    );

    return this.normalizeDispute(response.data);
  }

  // ===========================================================================
  // OUTBOUND: Send TO Ethoca
  // ===========================================================================

  /**
   * Submit an evidence package to Ethoca for a dispute.
   *
   * Ethoca evidence submissions include transaction details, guest stay
   * documentation, and supporting files that demonstrate the charge was valid.
   */
  async submitEvidence(disputeId, evidencePackage) {
    const files = evidencePackage.files || [];
    const metadata = evidencePackage.metadata || {};

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
        merchantDescriptor: metadata.merchantDescriptor || ''
      },
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[Ethoca] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Ethoca for a dispute.
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      responseType: responseData.representmentType || 'representment',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorTransactions: responseData.compellingEvidence?.priorTransactions || [],
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

    logger.info(`[Ethoca] Response submitted for dispute ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on an Ethoca alert by issuing a refund/credit.
   *
   * When accepting, the merchant agrees to credit the cardholder, which
   * closes the alert and prevents a formal chargeback from being filed.
   */
  async acceptDispute(disputeId, outcome = ALERT_OUTCOMES.REFUND) {
    const payload = {
      alertId: disputeId,
      merchantId: this.merchantId,
      action: 'accept',
      outcome,
      merchantNotes: `Liability accepted - action: ${outcome}`,
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/alerts/${disputeId}/respond`, payload)
    );

    logger.info(`[Ethoca] Alert ${disputeId} accepted with outcome: ${outcome}`);

    return {
      accepted: true,
      disputeId,
      outcome,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Alert accepted'
    };
  }

  /**
   * Update the status of a dispute case on Ethoca.
   */
  async updateCaseStatus(disputeId, status, notes = '') {
    const ethocaStatus = STATUS_MAP_TO_ETHOCA[status] || status;

    const response = await this._withRetry(() =>
      this.httpClient.post(`/disputes/${disputeId}/evidence`, {
        disputeId,
        merchantId: this.merchantId,
        statusUpdate: ethocaStatus,
        notes,
        updatedAt: new Date().toISOString()
      })
    );

    logger.info(`[Ethoca] Case ${disputeId} status updated to ${ethocaStatus}`);

    return {
      disputeId,
      status: ethocaStatus,
      message: response.data.message || 'Status updated',
      timestamp: new Date().toISOString()
    };
  }

  // ===========================================================================
  // CONSUMER CLARITY
  // ===========================================================================

  /**
   * Submit transaction enrichment data to Ethoca's Consumer Clarity service.
   *
   * Consumer Clarity allows issuers to display merchant-provided details
   * (hotel name, confirmation number, check-in/out dates, folio) to cardholders
   * who inquire about a charge. This often prevents disputes from being filed.
   *
   * @param {Object} enrichmentData
   * @param {string} enrichmentData.transactionId - Original transaction ID
   * @param {string} enrichmentData.cardLastFour - Last 4 of card number
   * @param {Object} enrichmentData.orderDetails - Reservation/order details
   * @returns {Promise<Object>} { enrichmentId, status, message }
   */
  async submitConsumerClarity(enrichmentData) {
    const payload = {
      merchantId: this.merchantId,
      transactionId: enrichmentData.transactionId,
      cardLastFour: enrichmentData.cardLastFour,
      transactionAmount: enrichmentData.amount,
      transactionDate: enrichmentData.transactionDate,
      merchantDescriptor: enrichmentData.merchantDescriptor || '',
      orderDetails: {
        orderType: 'hotel_reservation',
        confirmationNumber: enrichmentData.orderDetails.confirmationNumber,
        guestName: enrichmentData.orderDetails.guestName,
        checkInDate: enrichmentData.orderDetails.checkInDate,
        checkOutDate: enrichmentData.orderDetails.checkOutDate,
        propertyName: enrichmentData.orderDetails.propertyName,
        propertyAddress: enrichmentData.orderDetails.propertyAddress || '',
        propertyPhone: enrichmentData.orderDetails.propertyPhone || '',
        roomType: enrichmentData.orderDetails.roomType || '',
        totalAmount: enrichmentData.orderDetails.totalAmount,
        currency: enrichmentData.orderDetails.currency || 'USD',
        itemizedCharges: enrichmentData.orderDetails.itemizedCharges || [],
        cancellationPolicy: enrichmentData.orderDetails.cancellationPolicy || '',
        bookingSource: enrichmentData.orderDetails.bookingSource || 'direct',
        bookingDate: enrichmentData.orderDetails.bookingDate || null
      },
      deliveryDetails: {
        serviceDelivered: enrichmentData.deliveryDetails?.serviceDelivered !== false,
        deliveryDate: enrichmentData.deliveryDetails?.deliveryDate || enrichmentData.orderDetails.checkInDate,
        guestCheckedIn: enrichmentData.deliveryDetails?.guestCheckedIn !== false,
        noShow: enrichmentData.deliveryDetails?.noShow || false
      }
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/clarity/enrich', payload)
    );

    logger.info(
      `[Ethoca] Consumer Clarity data submitted for transaction ${enrichmentData.transactionId}`
    );

    return {
      enrichmentId: response.data.enrichmentId || response.data.id,
      status: response.data.status || 'accepted',
      message: response.data.message || 'Consumer Clarity data submitted'
    };
  }

  /**
   * Respond to a Consumer Clarity data request from an issuer.
   *
   * When an issuer requests clarity data for a specific transaction, Ethoca
   * sends a clarity.requested webhook. This method sends the enrichment
   * data in response.
   *
   * @param {string} requestId - The clarity request ID from the webhook
   * @param {Object} enrichmentData - The same format as submitConsumerClarity
   * @returns {Promise<Object>}
   */
  async respondToClarityRequest(requestId, enrichmentData) {
    const payload = {
      requestId,
      merchantId: this.merchantId,
      ...enrichmentData,
      respondedAt: new Date().toISOString()
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/clarity/requests/${requestId}/respond`, payload)
    );

    logger.info(`[Ethoca] Responded to Consumer Clarity request ${requestId}`);

    return {
      requestId,
      status: response.data.status || 'responded',
      message: response.data.message || 'Clarity request responded to successfully'
    };
  }

  // ===========================================================================
  // ELIMINATOR
  // ===========================================================================

  /**
   * Check whether a dispute can be auto-resolved by Ethoca Eliminator.
   *
   * Eliminator cross-references the merchant's transaction data with the
   * issuer's dispute claim. If compelling evidence is automatically matched,
   * the dispute is resolved without manual intervention.
   *
   * @param {Object} transactionData
   * @param {string} transactionData.disputeId - Ethoca dispute ID
   * @param {string} transactionData.transactionId - Original transaction ID
   * @param {number} transactionData.amount - Transaction amount
   * @param {Object} transactionData.guestDetails - Guest info for matching
   * @returns {Promise<Object>} { eligible, eliminatorId, action, message }
   */
  async checkEliminatorEligibility(transactionData) {
    const payload = {
      merchantId: this.merchantId,
      disputeId: transactionData.disputeId,
      transactionId: transactionData.transactionId,
      transactionAmount: transactionData.amount,
      guestDetails: {
        name: transactionData.guestDetails?.name,
        email: transactionData.guestDetails?.email,
        phone: transactionData.guestDetails?.phone
      },
      stayDetails: {
        confirmationNumber: transactionData.stayDetails?.confirmationNumber,
        checkInDate: transactionData.stayDetails?.checkInDate,
        checkOutDate: transactionData.stayDetails?.checkOutDate,
        propertyName: transactionData.stayDetails?.propertyName
      }
    };

    try {
      const response = await this._withRetry(() =>
        this.httpClient.post('/eliminator/check', payload)
      );

      const result = response.data;

      logger.info(
        `[Ethoca] Eliminator check for dispute ${transactionData.disputeId}: ` +
        `${result.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`
      );

      return {
        eligible: result.eligible || false,
        eliminatorId: result.eliminatorId || result.id || null,
        action: result.recommendedAction || null,
        confidence: result.confidenceScore || null,
        matchedFields: result.matchedFields || [],
        message: result.message || (result.eligible
          ? 'Dispute eligible for Eliminator auto-resolution'
          : 'Dispute not eligible for Eliminator')
      };
    } catch (error) {
      logger.warn(
        `[Ethoca] Eliminator check failed for dispute ${transactionData.disputeId}: ` +
        this._extractErrorMessage(error)
      );

      return {
        eligible: false,
        eliminatorId: null,
        action: null,
        message: `Eliminator check failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Ethoca webhook payload.
   *
   * Ethoca sends webhooks as JSON with the following top-level structure:
   *   { event: string, data: object, timestamp: string, alertId: string }
   */
  parseWebhookPayload(rawPayload, headers) {
    let parsed;

    if (typeof rawPayload === 'string') {
      try {
        parsed = JSON.parse(rawPayload);
      } catch (err) {
        logger.error('[Ethoca] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Ethoca webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(rawPayload)) {
      try {
        parsed = JSON.parse(rawPayload.toString('utf-8'));
      } catch (err) {
        logger.error('[Ethoca] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Ethoca webhook payload: not valid JSON');
      }
    } else {
      parsed = rawPayload;
    }

    return {
      event: parsed.event || parsed.eventType,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-ethoca-timestamp'] || new Date().toISOString(),
      alertId: parsed.alertId || parsed.data?.alertId || null,
      webhookId: parsed.webhookId || headers['x-ethoca-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Verify the signature of an Ethoca webhook payload.
   *
   * Ethoca signs webhooks using HMAC-SHA256. The signature is sent in the
   * X-Ethoca-Signature header.
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    if (!signature || !secret) {
      logger.warn('[Ethoca] Webhook signature verification skipped: missing signature or secret');
      return false;
    }

    const payload = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    return this._verifySignature(payload, signature, secret);
  }

  /**
   * Register a webhook callback URL with Ethoca for receiving event notifications.
   */
  async registerWebhook(callbackUrl, events = WEBHOOK_EVENTS) {
    const webhookSecret = this.webhookSecret || crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      version: 'v2',
      alertTypes: this.alertTypes
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[Ethoca] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize an Ethoca alert/dispute into AccuDefend's standard format.
   *
   * Ethoca payloads may be alerts (from the collaboration network) or formal
   * dispute objects. This method handles both shapes.
   */
  normalizeDispute(portalData) {
    const id = portalData.alertId || portalData.disputeId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedPan?.slice(-4) || '',
      cardBrand: 'MASTERCARD',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.alertDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      alertType: portalData.alertType || (portalData.alertId ? 'ETHOCA_ALERT' : 'DISPUTE'),
      isPreChargeback: !!portalData.alertId,
      issuerName: portalData.issuerName || portalData.issuingBank || null,
      transactionId: portalData.transactionId || portalData.acquirerReferenceNumber || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'ETHOCA',
      rawData: portalData
    };
  }

  /**
   * Map an Ethoca status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_ETHOCA[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Mastercard reason code to a structured object with category and description.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = MASTERCARD_REASON_CODES[normalized];

    if (known) {
      return {
        code: known.code,
        category: known.category,
        description: known.description
      };
    }

    // Categorize unknown Mastercard codes by number range
    const codeNum = parseInt(normalized, 10);

    if (codeNum >= 4800 && codeNum < 4900) {
      return {
        code: normalized,
        category: 'CONSUMER_DISPUTE',
        description: `Mastercard Dispute - Code ${normalized}`
      };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Mastercard Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify that we can communicate with the Ethoca API.
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/ping', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Ethoca API is reachable',
        details: {
          portalType: 'ETHOCA',
          merchantId: this.merchantId,
          alertTypes: this.alertTypes,
          apiVersion: 'v2',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Ethoca API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'ETHOCA',
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
   * Return default evidence instructions based on the Mastercard reason code.
   */
  _getDefaultEvidenceInstructions(reasonCode) {
    const instructions = {
      '4837': 'Provide evidence that the cardholder authorized the transaction: ' +
              'signed receipt, chip read log, AVS/CVV match confirmation, ' +
              'ID verification, or device fingerprint data.',
      '4853': 'Provide evidence that services were as described: ' +
              'booking confirmation showing room type and amenities, guest folio, ' +
              'terms accepted at booking, and any guest correspondence.',
      '4855': 'Provide proof that the guest received the hotel services: ' +
              'check-in confirmation, signed registration card, room folio, ' +
              'key card access logs, or ID verification records.',
      '4860': 'Provide evidence that a credit is not owed or has already been issued: ' +
              'refund policy accepted by the guest, cancellation policy terms, ' +
              'proof that no cancellation was received, or proof of credit already processed.',
      '4863': 'Provide evidence to help the cardholder recognize the transaction: ' +
              'booking confirmation with merchant name, signed registration card, ' +
              'folio showing the merchant descriptor, and any guest correspondence.'
    };

    return instructions[reasonCode] ||
      'Submit all available evidence including guest folio, signed registration, ' +
      'booking confirmation, correspondence, and any other compelling documentation.';
  }
}

// Export the adapter class and alert outcomes for external use
EthocaAdapter.ALERT_OUTCOMES = ALERT_OUTCOMES;

module.exports = EthocaAdapter;
