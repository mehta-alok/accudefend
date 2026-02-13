/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * American Express Merchant Portal Dispute Adapter
 *
 * Implements two-way integration with American Express's dispute management platform:
 *   - Handles AMEX chargebacks, inquiries, and adjustments through the
 *     AMEX Merchant Dispute API
 *   - Supports AMEX SafeKey (3-D Secure) data for fraud disputes
 *   - Leverages Member Since date lookups for loyalty-based compelling evidence
 *   - Implements AMEX's unique 20-day response window for chargebacks
 *   - Covers all AMEX-specific reason codes (A01-P05) which differ from
 *     Visa/Mastercard numbering schemes
 *   - Handles AMEX's inquiry-first flow where cardholders can inquire
 *     before filing a formal chargeback
 *
 * Auth: API Key + Merchant SE (Service Establishment) number in request headers.
 * Base URL: https://api.americanexpress.com (configurable via AMEX_API_URL env var)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// AMEX REASON CODE MAPPINGS (Complete Set)
// =============================================================================

const AMEX_REASON_CODES = {
  // Fraud reason codes (A series)
  'A01': {
    code: 'A01', category: 'FRAUD',
    description: 'Charge Amount Exceeds Authorization Amount',
    compellingEvidenceTypes: ['authorization_approval_code', 'signed_receipt', 'folio'],
    responseDeadlineDays: 20
  },
  'A02': {
    code: 'A02', category: 'FRAUD',
    description: 'No Valid Authorization',
    compellingEvidenceTypes: ['authorization_approval_code', 'authorization_log', 'transaction_receipt'],
    responseDeadlineDays: 20
  },
  'A08': {
    code: 'A08', category: 'FRAUD',
    description: 'Authorization Approval Expired',
    compellingEvidenceTypes: ['authorization_date_proof', 'reauthorization_log', 'transaction_receipt'],
    responseDeadlineDays: 20
  },
  // Consumer dispute codes (C series)
  'C02': {
    code: 'C02', category: 'CONSUMER_DISPUTE',
    description: 'Credit Not Processed',
    compellingEvidenceTypes: [
      'refund_policy', 'terms_and_conditions', 'no_refund_entitlement',
      'credit_issued_proof', 'cancellation_policy'
    ],
    responseDeadlineDays: 20
  },
  'C04': {
    code: 'C04', category: 'CONSUMER_DISPUTE',
    description: 'Goods/Services Returned or Refused',
    compellingEvidenceTypes: [
      'no_return_policy', 'terms_accepted', 'proof_service_rendered',
      'guest_folio', 'signed_registration'
    ],
    responseDeadlineDays: 20
  },
  'C05': {
    code: 'C05', category: 'CONSUMER_DISPUTE',
    description: 'Goods/Services Cancelled',
    compellingEvidenceTypes: [
      'cancellation_policy', 'no_show_documentation', 'terms_accepted',
      'reservation_confirmation', 'guest_folio'
    ],
    responseDeadlineDays: 20
  },
  'C08': {
    code: 'C08', category: 'CONSUMER_DISPUTE',
    description: 'Goods/Services Not Received or Only Partially Received',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'guest_registration_card', 'key_card_access_log', 'id_verification'
    ],
    responseDeadlineDays: 20
  },
  'C14': {
    code: 'C14', category: 'CONSUMER_DISPUTE',
    description: 'Paid by Other Means',
    compellingEvidenceTypes: ['transaction_log', 'unique_transaction_ids', 'proof_of_separate_charges'],
    responseDeadlineDays: 20
  },
  'C18': {
    code: 'C18', category: 'CONSUMER_DISPUTE',
    description: 'No Show / CancellationPolicy Dispute',
    compellingEvidenceTypes: [
      'cancellation_policy', 'no_show_documentation', 'reservation_confirmation',
      'terms_accepted', 'guest_folio', 'booking_confirmation'
    ],
    responseDeadlineDays: 20
  },
  'C28': {
    code: 'C28', category: 'CONSUMER_DISPUTE',
    description: 'Cancelled Recurring Billing',
    compellingEvidenceTypes: [
      'recurring_agreement', 'cancellation_policy', 'terms_and_conditions',
      'proof_of_cancellation_request_absence'
    ],
    responseDeadlineDays: 20
  },
  'C31': {
    code: 'C31', category: 'CONSUMER_DISPUTE',
    description: 'Goods/Services Not as Described',
    compellingEvidenceTypes: [
      'service_description', 'booking_confirmation', 'folio',
      'guest_correspondence', 'terms_accepted', 'property_photos'
    ],
    responseDeadlineDays: 20
  },
  'C32': {
    code: 'C32', category: 'CONSUMER_DISPUTE',
    description: 'Goods/Services Damaged or Defective',
    compellingEvidenceTypes: [
      'quality_documentation', 'inspection_report', 'guest_correspondence',
      'resolution_offered', 'terms_accepted'
    ],
    responseDeadlineDays: 20
  },
  // Fraud codes (F series)
  'F10': {
    code: 'F10', category: 'FRAUD',
    description: 'Missing Imprint',
    compellingEvidenceTypes: ['card_imprint', 'chip_read_log', 'signed_receipt', 'id_verification'],
    responseDeadlineDays: 20
  },
  'F14': {
    code: 'F14', category: 'FRAUD',
    description: 'Missing Signature',
    compellingEvidenceTypes: ['signed_receipt', 'signed_registration_card', 'pin_validation', 'chip_read_log'],
    responseDeadlineDays: 20
  },
  'F22': {
    code: 'F22', category: 'FRAUD',
    description: 'Expired or Not Yet Valid Card',
    compellingEvidenceTypes: ['authorization_approval_code', 'valid_date_verification'],
    responseDeadlineDays: 20
  },
  'F24': {
    code: 'F24', category: 'FRAUD',
    description: 'No Cardmember Authorization',
    compellingEvidenceTypes: [
      'signed_receipt', 'signed_registration_card', 'avs_cvv_match',
      'safekey_authentication', 'device_fingerprint', 'ip_address_log'
    ],
    responseDeadlineDays: 20
  },
  'F29': {
    code: 'F29', category: 'FRAUD',
    description: 'Card Not Present',
    compellingEvidenceTypes: [
      'avs_cvv_match', 'safekey_authentication', 'delivery_confirmation',
      'device_fingerprint', 'ip_address_match', 'prior_undisputed_transactions'
    ],
    responseDeadlineDays: 20
  },
  'F30': {
    code: 'F30', category: 'FRAUD',
    description: 'EMV Counterfeit',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'terminal_capability_certificate'],
    responseDeadlineDays: 20
  },
  'F31': {
    code: 'F31', category: 'FRAUD',
    description: 'EMV Lost/Stolen/Non-Received',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'pin_validation', 'id_verification'],
    responseDeadlineDays: 20
  },
  // Miscellaneous codes (M series)
  'M01': {
    code: 'M01', category: 'PROCESSING_ERROR',
    description: 'Chargeback Authorization',
    compellingEvidenceTypes: ['authorization_approval_code', 'authorization_log'],
    responseDeadlineDays: 20
  },
  'M10': {
    code: 'M10', category: 'PROCESSING_ERROR',
    description: 'Vehicle Rental - Loss/Theft',
    compellingEvidenceTypes: ['rental_agreement', 'police_report', 'damage_documentation'],
    responseDeadlineDays: 20
  },
  'M49': {
    code: 'M49', category: 'PROCESSING_ERROR',
    description: 'Vehicle Rental - Damage',
    compellingEvidenceTypes: ['rental_agreement', 'damage_report', 'repair_estimate'],
    responseDeadlineDays: 20
  },
  // Processing error codes (P series)
  'P01': {
    code: 'P01', category: 'PROCESSING_ERROR',
    description: 'Unassigned Card Number',
    compellingEvidenceTypes: ['account_verification', 'authorization_approval_code'],
    responseDeadlineDays: 20
  },
  'P03': {
    code: 'P03', category: 'PROCESSING_ERROR',
    description: 'Credit Processed as Charge',
    compellingEvidenceTypes: ['transaction_receipt', 'processing_records', 'settlement_report'],
    responseDeadlineDays: 20
  },
  'P04': {
    code: 'P04', category: 'PROCESSING_ERROR',
    description: 'Charge Processed as Credit',
    compellingEvidenceTypes: ['transaction_receipt', 'processing_records', 'settlement_report'],
    responseDeadlineDays: 20
  },
  'P05': {
    code: 'P05', category: 'PROCESSING_ERROR',
    description: 'Incorrect Charge Amount',
    compellingEvidenceTypes: ['signed_receipt', 'folio', 'itemized_charges', 'authorization_amount_proof'],
    responseDeadlineDays: 20
  }
};

// AMEX dispute types
const DISPUTE_TYPES = {
  INQUIRY: 'inquiry',
  CHARGEBACK: 'chargeback',
  ADJUSTMENT: 'adjustment',
  FRAUD_FULL_RECOURSE: 'fraud_full_recourse'
};

// AMEX portal status -> AccuDefend internal status
const STATUS_MAP_FROM_AMEX = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending_merchant_response': 'PENDING',
  'inquiry_pending': 'PENDING',
  'under_review': 'IN_REVIEW',
  'amex_review': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'response_submitted': 'SUBMITTED',
  'merchant_won': 'WON',
  'resolved_in_merchant_favor': 'WON',
  'chargeback_reversed': 'WON',
  'merchant_lost': 'LOST',
  'resolved_against_merchant': 'LOST',
  'chargeback_upheld': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'accepted_by_merchant': 'RESOLVED'
};

// AccuDefend status -> AMEX portal status
const STATUS_MAP_TO_AMEX = {
  'PENDING': 'open',
  'IN_REVIEW': 'under_review',
  'SUBMITTED': 'response_submitted',
  'WON': 'merchant_won',
  'LOST': 'merchant_lost',
  'EXPIRED': 'expired',
  'RESOLVED': 'closed'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'inquiry.created',
  'inquiry.updated',
  'chargeback.created',
  'chargeback.updated',
  'chargeback.status_changed',
  'adjustment.created',
  'response.accepted',
  'response.declined',
  'fraud_alert.received'
];


class AmexMerchantAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey          - AMEX Merchant API key
   * @param {string} config.credentials.merchantSE      - AMEX Service Establishment number
   * @param {string} config.credentials.merchantName    - Merchant name on file with AMEX
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.credentials.safeKeyMID]    - SafeKey Merchant ID for 3DS lookups
   * @param {string} [config.baseUrl]                   - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'AMEX',
      baseUrl: config.baseUrl || process.env.AMEX_API_URL || 'https://api.americanexpress.com'
    });

    this.apiKey = this.credentials.apiKey;
    this.merchantSE = this.credentials.merchantSE;
    this.merchantName = this.credentials.merchantName || '';
    this.webhookSecret = this.credentials.webhookSecret || null;
    this.safeKeyMID = this.credentials.safeKeyMID || null;

    // Initialize HTTP client with AMEX-specific auth headers
    this._initHttpClient({
      'X-AMEX-API-Key': this.apiKey,
      'X-AMEX-Merchant-SE': this.merchantSE,
      'Authorization': `MAC id="${this.apiKey}"`
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with the American Express Merchant API.
   * AMEX uses API Key + Merchant SE number authentication.
   * This method validates the credentials by making a lightweight API call.
   *
   * @returns {Promise<Object>} { authenticated, merchantSE, merchantName }
   */
  async authenticate() {
    logger.info(`[AMEX] Authenticating Merchant SE: ${this.merchantSE}`);

    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/api/v1/merchant/profile', {
          params: { se: this.merchantSE }
        })
      );

      const profile = response.data;
      this.merchantName = profile.merchantName || this.merchantName;

      logger.info(`[AMEX] Authentication successful for SE: ${this.merchantSE} (${this.merchantName})`);

      return {
        authenticated: true,
        merchantSE: this.merchantSE,
        merchantName: this.merchantName,
        memberSinceDate: profile.memberSinceDate || null,
        safeKeyEnabled: profile.safeKeyEnabled || false,
        apiVersion: 'v1'
      };
    } catch (error) {
      logger.error('[AMEX] Authentication failed:', this._extractErrorMessage(error));
      throw new Error(`AMEX authentication failed: ${this._extractErrorMessage(error)}`);
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM AMEX
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from AMEX.
   * Handles inquiries, chargebacks, and adjustments. AMEX uses an inquiry-first
   * flow where cardholders can inquire before filing a formal chargeback.
   *
   * @param {Object} disputeData - Raw AMEX dispute payload
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[AMEX] Receiving dispute: ${disputeData.caseNumber || disputeData.disputeId || disputeData.inquiryNumber}`);

    const normalized = this.normalizeDispute(disputeData);

    // Enrich with SafeKey data if available
    if (this.safeKeyMID && normalized.transactionId) {
      try {
        const safeKeyData = await this._lookupSafeKeyData(normalized.transactionId);
        if (safeKeyData) {
          normalized.safeKeyData = safeKeyData;
          normalized.safeKeyAuthenticated = safeKeyData.authenticationStatus === 'authenticated';
        }
      } catch (err) {
        logger.warn(`[AMEX] SafeKey lookup failed for transaction ${normalized.transactionId}: ${err.message}`);
      }
    }

    // Enrich with Member Since date for loyalty evidence
    if (normalized.cardLastFour) {
      try {
        const memberData = await this._lookupMemberSinceDate(normalized.cardLastFour, normalized.rawData);
        if (memberData) {
          normalized.memberSinceDate = memberData.memberSinceDate;
          normalized.memberYears = memberData.memberYears;
        }
      } catch (err) {
        logger.warn(`[AMEX] Member Since lookup failed: ${err.message}`);
      }
    }

    // Calculate response deadline (AMEX uses 20-day window)
    if (!normalized.dueDate) {
      normalized.dueDate = this._calculateResponseDeadline(
        normalized.disputeDate,
        normalized.disputeType,
        normalized.reasonCode
      );
    }

    logger.info(`[AMEX] Dispute normalized: ${normalized.disputeId} | Type: ${normalized.disputeType} | Reason: ${normalized.reasonCode} | Due: ${normalized.dueDate}`);
    return normalized;
  }

  /**
   * Query AMEX for the current status of a dispute.
   *
   * @param {string} disputeId - AMEX case number
   * @returns {Promise<Object>} Status details
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v1/disputes/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status || data.caseStatus),
      portalStatus: data.status || data.caseStatus,
      disputeType: data.disputeType || data.caseType || DISPUTE_TYPES.CHARGEBACK,
      lastUpdated: data.lastModifiedDate || data.updatedAt,
      notes: data.statusNotes || data.notes || '',
      outcome: data.outcome || null,
      outcomeDate: data.resolutionDate || null,
      financialImpact: data.financialImpact || null,
      amexReviewNotes: data.amexReviewNotes || null,
      daysRemaining: data.daysRemaining || null
    };
  }

  /**
   * Retrieve evidence requirements for an AMEX dispute.
   *
   * @param {string} disputeId - AMEX case number
   * @returns {Promise<Object>} Evidence requirements
   */
  async getEvidenceRequirements(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v1/disputes/${disputeId}`)
    );

    const dispute = response.data;
    const reasonCode = dispute.reasonCode || dispute.chargebackReasonCode;
    const reasonInfo = AMEX_REASON_CODES[reasonCode] || {};

    const portalRequired = dispute.requiredDocumentTypes || [];
    const reasonRequired = reasonInfo.compellingEvidenceTypes || [];
    const allRequired = [...new Set([...portalRequired, ...reasonRequired])];

    return {
      disputeId,
      requiredTypes: allRequired,
      portalRequiredTypes: portalRequired,
      recommendedTypes: reasonRequired,
      deadline: dispute.responseDeadline || dispute.dueDate,
      deadlineDays: reasonInfo.responseDeadlineDays || 20,
      instructions: dispute.evidenceInstructions || this._getDefaultEvidenceInstructions(reasonCode),
      reasonCode,
      reasonCategory: reasonInfo.category || 'UNKNOWN',
      disputeType: dispute.disputeType || DISPUTE_TYPES.CHARGEBACK,
      safeKeyRelevant: ['F24', 'F29'].includes(reasonCode),
      memberSinceDateRelevant: ['C08', 'C31', 'F24', 'F29'].includes(reasonCode)
    };
  }

  /**
   * Fetch a paginated list of disputes from the AMEX Merchant Portal.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Paginated dispute list
   */
  async listDisputes(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      endDate: params.until || undefined,
      status: params.status || undefined,
      disputeType: params.disputeType || undefined,
      reasonCode: params.reasonCode || undefined,
      merchantSE: this.merchantSE,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/api/v1/disputes', { params: queryParams })
    );

    const data = response.data;
    const disputes = data.disputes || data.cases || data.data || [];

    return {
      disputes: disputes.map((d) => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.totalRecords || disputes.length,
      hasMore: data.hasMore || (data.currentPage < data.totalPages),
      page: data.currentPage || data.page || queryParams.page
    };
  }

  // ===========================================================================
  // OUTBOUND: Send TO AMEX
  // ===========================================================================

  /**
   * Submit an evidence package to AMEX for a dispute response.
   * AMEX requires evidence to be submitted before or alongside the formal response.
   *
   * @param {string} disputeId - AMEX case number
   * @param {Object} evidence  - Evidence package with files and metadata
   * @returns {Promise<Object>} Submission result
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      caseNumber: disputeId,
      merchantSE: this.merchantSE,
      evidenceCategory: metadata.evidenceCategory || 'merchant_evidence',
      documents: files.map((file, index) => ({
        documentType: file.type || 'supporting_document',
        documentCategory: file.category || 'evidence',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        fileContent: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`,
        pageCount: file.pageCount || 1
      })),
      transactionDetails: {
        cardmemberName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authorizationCode: metadata.authorizationCode
      },
      safeKeyData: metadata.safeKeyData || null,
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('amex_evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[AMEX] Evidence submitted for case ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a formal dispute response to AMEX for a chargeback or inquiry.
   * AMEX requires a specific response format that differs from Visa/Mastercard.
   *
   * @param {string} disputeId    - AMEX case number
   * @param {Object} responseData - Dispute response details
   * @returns {Promise<Object>}   Result of response submission
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      caseNumber: disputeId,
      merchantSE: this.merchantSE,
      responseType: responseData.representmentType || 'dispute_response',
      disputeType: responseData.disputeType || DISPUTE_TYPES.CHARGEBACK,
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        safeKeyAuthentication: responseData.compellingEvidence?.safeKeyData || null,
        memberSinceDate: responseData.compellingEvidence?.memberSinceDate || null,
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceFingerprint: responseData.compellingEvidence?.deviceFingerprint || null
      },
      guestDetails: {
        cardmemberName: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        memberNumber: responseData.guestDetails?.loyaltyNumber || null,
        memberSinceDate: responseData.guestDetails?.memberSinceDate || null
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
        earlyCheckout: responseData.stayDetails?.earlyCheckout || false,
        folioNumber: responseData.stayDetails?.folioNumber || null
      },
      evidenceIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('amex_response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[AMEX] Response submitted for case ${disputeId} (type: ${payload.disputeType})`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      disputeType: payload.disputeType,
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on an AMEX dispute (do not contest).
   *
   * @param {string} disputeId - AMEX case number
   * @returns {Promise<Object>} Acceptance result
   */
  async acceptDispute(disputeId) {
    const payload = {
      caseNumber: disputeId,
      merchantSE: this.merchantSE,
      action: 'accept_liability',
      merchantNotes: 'Liability accepted by merchant via AccuDefend',
      idempotencyKey: this._generateIdempotencyKey('amex_accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/accept`, payload)
    );

    logger.info(`[AMEX] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute liability accepted'
    };
  }

  // ===========================================================================
  // AMEX INQUIRY FLOW
  // ===========================================================================

  /**
   * Respond to an AMEX inquiry. Inquiries precede chargebacks in AMEX's flow.
   * A timely inquiry response can prevent the dispute from escalating to a chargeback.
   *
   * @param {string} inquiryId   - AMEX inquiry number
   * @param {Object} inquiryData - Inquiry response data
   * @returns {Promise<Object>}  Response result
   */
  async respondToInquiry(inquiryId, inquiryData) {
    const payload = {
      inquiryNumber: inquiryId,
      merchantSE: this.merchantSE,
      responseType: 'inquiry_response',
      transactionDetails: {
        cardmemberName: inquiryData.guestName,
        confirmationNumber: inquiryData.confirmationNumber,
        checkInDate: inquiryData.checkInDate,
        checkOutDate: inquiryData.checkOutDate,
        transactionAmount: inquiryData.transactionAmount,
        transactionDate: inquiryData.transactionDate,
        itemizedCharges: inquiryData.itemizedCharges || [],
        folioNumber: inquiryData.folioNumber || null
      },
      merchantExplanation: inquiryData.explanation || '',
      supportingDocumentIds: inquiryData.evidenceIds || [],
      creditOfferred: inquiryData.creditOffered || false,
      creditAmount: inquiryData.creditAmount || null,
      idempotencyKey: this._generateIdempotencyKey('amex_inquiry')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/inquiries/${inquiryId}/respond`, payload)
    );

    logger.info(`[AMEX] Inquiry ${inquiryId} responded (credit offered: ${payload.creditOfferred})`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'responded',
      message: response.data.message || 'Inquiry response submitted',
      preventedChargeback: response.data.preventedChargeback || false,
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // SAFEKEY AND MEMBER DATA LOOKUPS
  // ===========================================================================

  /**
   * Look up SafeKey (3-D Secure) authentication data for a transaction.
   * SafeKey data is critical evidence for fraud disputes (F24, F29).
   *
   * @param {string} transactionId - Transaction identifier
   * @returns {Promise<Object|null>} SafeKey authentication data or null
   * @private
   */
  async _lookupSafeKeyData(transactionId) {
    if (!this.safeKeyMID) return null;

    try {
      const response = await this._withRetry(() =>
        this.httpClient.get(`/api/v1/safekey/transactions/${transactionId}`, {
          params: { merchantSE: this.merchantSE, safeKeyMID: this.safeKeyMID }
        })
      );

      const data = response.data;
      return {
        transactionId,
        authenticationStatus: data.authenticationStatus || 'unknown',
        eci: data.eci || '',
        cavv: data.cavv || '',
        xid: data.xid || '',
        dsTransactionId: data.dsTransactionId || '',
        threeDSVersion: data.threeDSVersion || '2.0',
        authenticationDate: data.authenticationDate || null,
        liabilityShift: data.liabilityShift || false
      };
    } catch (error) {
      logger.warn(`[AMEX] SafeKey lookup failed for ${transactionId}: ${this._extractErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Look up the AMEX Member Since date for a cardmember.
   * This is unique to AMEX and can be used as compelling evidence showing
   * long-standing legitimate card usage.
   *
   * @param {string} cardLastFour - Last 4 digits of card number
   * @param {Object} disputeData  - Original dispute data for lookup context
   * @returns {Promise<Object|null>} Member data or null
   * @private
   */
  async _lookupMemberSinceDate(cardLastFour, disputeData) {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/api/v1/cardmember/lookup', {
          params: {
            merchantSE: this.merchantSE,
            cardLastFour,
            transactionId: disputeData.transactionId || '',
            caseNumber: disputeData.caseNumber || disputeData.disputeId || ''
          }
        })
      );

      const data = response.data;
      const memberSinceDate = data.memberSinceDate || null;
      let memberYears = null;

      if (memberSinceDate) {
        const sinceDate = new Date(memberSinceDate);
        const now = new Date();
        memberYears = Math.floor((now - sinceDate) / (365.25 * 24 * 60 * 60 * 1000));
      }

      return {
        memberSinceDate,
        memberYears,
        cardProgram: data.cardProgram || '',
        cardType: data.cardType || ''
      };
    } catch (error) {
      logger.warn(`[AMEX] Member Since lookup failed: ${this._extractErrorMessage(error)}`);
      return null;
    }
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw AMEX webhook payload.
   * AMEX sends webhooks as JSON with structure:
   *   { eventType, caseNumber, payload, timestamp, hmacSignature }
   *
   * @param {Object} headers - HTTP request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} Parsed webhook event
   */
  parseWebhookPayload(headers, body) {
    let parsed;

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[AMEX] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid AMEX webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[AMEX] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid AMEX webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify HMAC signature if webhook secret is configured
    const signature = headers['x-amex-hmac-signature'] || headers['x-amex-signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[AMEX] Webhook signature verification failed');
        throw new Error('Invalid AMEX webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event,
      disputeId: parsed.caseNumber || parsed.disputeId || parsed.inquiryNumber,
      data: parsed.payload || parsed.data || parsed,
      timestamp: parsed.timestamp || headers['x-amex-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-amex-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with AMEX for event notifications.
   *
   * @param {Object} config - Webhook registration configuration
   * @returns {Promise<Object>} Registration result
   */
  async registerWebhook(config) {
    const callbackUrl = typeof config === 'string' ? config : config.callbackUrl;
    const events = (typeof config === 'object' && config.events) ? config.events : WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantSE: this.merchantSE,
      callbackUrl,
      events,
      active: true,
      hmacSecret: webhookSecret,
      format: 'json',
      apiVersion: 'v1'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/api/v1/webhooks', payload)
    );

    this.webhookSecret = webhookSecret;

    logger.info(`[AMEX] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize an AMEX dispute/inquiry/adjustment into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw AMEX dispute data
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.caseNumber || portalData.disputeId || portalData.inquiryNumber || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.disputeAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    // Determine dispute type
    let disputeType = DISPUTE_TYPES.CHARGEBACK;
    if (portalData.inquiryNumber || portalData.disputeType === 'inquiry') {
      disputeType = DISPUTE_TYPES.INQUIRY;
    } else if (portalData.disputeType === 'adjustment') {
      disputeType = DISPUTE_TYPES.ADJUSTMENT;
    } else if (portalData.fraudFullRecourse) {
      disputeType = DISPUTE_TYPES.FRAUD_FULL_RECOURSE;
    }

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedAccountNumber?.slice(-4) || '',
      cardBrand: 'AMEX',
      guestName: portalData.cardmemberName || portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.disputeDate || portalData.chargebackDate || portalData.inquiryDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status || portalData.caseStatus),
      portalStatus: portalData.status || portalData.caseStatus,
      disputeType,
      alertType: disputeType === DISPUTE_TYPES.INQUIRY ? 'INQUIRY' : 'CHARGEBACK',
      isPreChargeback: disputeType === DISPUTE_TYPES.INQUIRY,
      transactionId: portalData.transactionId || portalData.referenceNumber || '',
      transactionDate: portalData.transactionDate || null,
      authorizationCode: portalData.authorizationCode || portalData.approvalCode || '',
      merchantSE: this.merchantSE,
      safeKeyAuthenticated: portalData.safeKeyAuthenticated || false,
      memberSinceDate: portalData.memberSinceDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'AMEX',
      rawData: portalData
    };
  }

  /**
   * Map an AMEX status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - AMEX status value
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_AMEX[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map an AMEX reason code to a structured object with category and description.
   *
   * @param {string} portalCode - AMEX reason code (e.g. 'A01', 'C08', 'F29')
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase();
    const known = AMEX_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    // Attempt to categorize unknown codes by prefix letter
    if (normalized.startsWith('A')) {
      return { code: normalized, category: 'AUTHORIZATION', description: `AMEX Authorization - Code ${normalized}` };
    }
    if (normalized.startsWith('C')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `AMEX Consumer Dispute - Code ${normalized}` };
    }
    if (normalized.startsWith('F')) {
      return { code: normalized, category: 'FRAUD', description: `AMEX Fraud - Code ${normalized}` };
    }
    if (normalized.startsWith('M')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `AMEX Miscellaneous - Code ${normalized}` };
    }
    if (normalized.startsWith('P')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `AMEX Processing Error - Code ${normalized}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `AMEX Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the AMEX Merchant API.
   *
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/api/v1/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'AMEX Merchant API is reachable',
        details: {
          portalType: 'AMEX',
          merchantSE: this.merchantSE,
          merchantName: this.merchantName,
          safeKeyEnabled: !!this.safeKeyMID,
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `AMEX health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'AMEX',
          merchantSE: this.merchantSE,
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
   * Calculate the response deadline for an AMEX dispute.
   * AMEX uses a 20-day response window for most dispute types.
   *
   * @param {string} disputeDate - ISO date of the dispute
   * @param {string} disputeType - Type of dispute (inquiry, chargeback, adjustment)
   * @param {string} reasonCode  - AMEX reason code
   * @returns {string} ISO date of the response deadline
   * @private
   */
  _calculateResponseDeadline(disputeDate, disputeType, reasonCode) {
    const baseDate = new Date(disputeDate || Date.now());
    const reasonInfo = AMEX_REASON_CODES[reasonCode] || {};
    let deadlineDays = reasonInfo.responseDeadlineDays || 20;

    // Inquiries have a different (shorter) window
    if (disputeType === DISPUTE_TYPES.INQUIRY) {
      deadlineDays = 10;
    }

    // Fraud full recourse has a tighter deadline
    if (disputeType === DISPUTE_TYPES.FRAUD_FULL_RECOURSE) {
      deadlineDays = 15;
    }

    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + deadlineDays);
    return deadline.toISOString();
  }

  /**
   * Return default evidence instructions based on the AMEX reason code.
   *
   * @param {string} reasonCode - AMEX reason code
   * @returns {string} Evidence instructions
   * @private
   */
  _getDefaultEvidenceInstructions(reasonCode) {
    const instructions = {
      'C02': 'Provide refund policy accepted by cardmember, proof no cancellation was received, ' +
             'or proof that a credit has already been issued. Include the AMEX SE number on all documents.',
      'C05': 'Provide cancellation policy accepted at booking, no-show documentation, ' +
             'reservation confirmation with terms, and guest folio. AMEX requires proof ' +
             'that the cancellation policy was clearly disclosed.',
      'C08': 'Provide proof the cardmember received services: check-in confirmation, ' +
             'signed registration card, key card access logs, room folio, and ID verification. ' +
             'Member Since date may be used as supporting evidence.',
      'C18': 'Provide no-show documentation with the cancellation policy that was accepted ' +
             'at time of booking. Include the reservation confirmation email and any reminders sent.',
      'C31': 'Provide booking confirmation showing room type/amenities as advertised, ' +
             'guest folio showing actual charges, property photos, and guest correspondence.',
      'F24': 'Provide proof of cardmember authorization: signed receipt, AVS/CVV match data, ' +
             'SafeKey (3DS) authentication results, and device fingerprint. ' +
             'AMEX SafeKey data is critical evidence for this reason code.',
      'F29': 'Provide compelling evidence for card-not-present fraud: AVS/CVV match, ' +
             'SafeKey authentication, delivery confirmation, device fingerprint, ' +
             'IP address logs, and prior undisputed transactions.',
      'P05': 'Provide signed receipt or folio showing the correct charge amount, ' +
             'itemized breakdown of all charges, and authorization approval code.'
    };

    return instructions[reasonCode] ||
      'Submit all available evidence including guest folio, signed registration, ' +
      'booking confirmation, authorization records, and SafeKey data if applicable. ' +
      'AMEX requires responses within 20 days of the dispute date.';
  }
}

module.exports = AmexMerchantAdapter;
