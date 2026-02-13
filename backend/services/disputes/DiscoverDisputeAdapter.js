/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Discover Dispute Management Adapter
 *
 * Implements two-way integration with Discover's merchant dispute portal:
 *   - Handles retrievals (pre-chargeback inquiries), chargebacks, and
 *     pre-arbitration cases through Discover's Dispute API
 *   - Supports Discover's retrieval-first flow where issuers request
 *     transaction information before filing a chargeback
 *   - Implements Discover's 30-day response window for chargebacks
 *   - Covers all Discover-specific reason codes (AA through UA12)
 *   - Handles Discover's unique two-letter + optional numeric reason code format
 *   - Supports ProtectBuy (Discover's 3-D Secure) data for fraud disputes
 *
 * Auth: API Key authentication via X-Discover-API-Key header.
 * Base URL: https://api.discover.com (configurable via DISCOVER_API_URL env var)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// DISCOVER REASON CODE MAPPINGS (Complete Set)
// =============================================================================

const DISCOVER_REASON_CODES = {
  // Authorization-related
  'AA': {
    code: 'AA', category: 'AUTHORIZATION',
    description: 'Does Not Recognize',
    compellingEvidenceTypes: [
      'signed_receipt', 'guest_registration_card', 'check_in_proof',
      'id_verification', 'avs_cvv_match', 'device_fingerprint'
    ],
    responseDeadlineDays: 30
  },
  'AP': {
    code: 'AP', category: 'PROCESSING_ERROR',
    description: 'Cancelled Recurring Transaction',
    compellingEvidenceTypes: [
      'recurring_agreement', 'cancellation_policy', 'terms_and_conditions',
      'proof_of_cancellation_absence', 'signed_agreement'
    ],
    responseDeadlineDays: 30
  },
  'AW': {
    code: 'AW', category: 'AUTHORIZATION',
    description: 'Altered Amount',
    compellingEvidenceTypes: ['signed_receipt', 'folio', 'itemized_charges', 'authorization_amount_proof'],
    responseDeadlineDays: 30
  },
  // Card-related
  'CD': {
    code: 'CD', category: 'PROCESSING_ERROR',
    description: 'Credit/Debit Posted Incorrectly',
    compellingEvidenceTypes: ['transaction_receipt', 'processing_records', 'settlement_report'],
    responseDeadlineDays: 30
  },
  'DA': {
    code: 'DA', category: 'AUTHORIZATION',
    description: 'Declined Authorization',
    compellingEvidenceTypes: ['authorization_approval_code', 'authorization_log', 'transaction_receipt'],
    responseDeadlineDays: 30
  },
  'DP': {
    code: 'DP', category: 'PROCESSING_ERROR',
    description: 'Duplicate Processing',
    compellingEvidenceTypes: ['transaction_log', 'unique_transaction_ids', 'batch_settlement_report', 'separate_service_proof'],
    responseDeadlineDays: 30
  },
  'EX': {
    code: 'EX', category: 'PROCESSING_ERROR',
    description: 'Expired Card',
    compellingEvidenceTypes: ['authorization_approval_code', 'valid_date_verification'],
    responseDeadlineDays: 30
  },
  // Fraud codes
  'FR': {
    code: 'FR', category: 'FRAUD',
    description: 'Fraud',
    compellingEvidenceTypes: [
      'signed_receipt', 'chip_read_log', 'avs_cvv_match',
      'protectbuy_authentication', 'device_fingerprint', 'ip_address_log',
      'id_verification', 'prior_undisputed_transactions'
    ],
    responseDeadlineDays: 30
  },
  // Goods/Services
  'IN': {
    code: 'IN', category: 'CONSUMER_DISPUTE',
    description: 'Not Classified (Inquiry/Notification)',
    compellingEvidenceTypes: ['transaction_receipt', 'folio', 'guest_correspondence'],
    responseDeadlineDays: 30
  },
  'LP': {
    code: 'LP', category: 'PROCESSING_ERROR',
    description: 'Late Presentment',
    compellingEvidenceTypes: ['authorization_date_proof', 'transaction_date_proof', 'delayed_charge_disclosure'],
    responseDeadlineDays: 30
  },
  'NA': {
    code: 'NA', category: 'AUTHORIZATION',
    description: 'No Authorization',
    compellingEvidenceTypes: ['authorization_approval_code', 'authorization_log', 'transaction_receipt'],
    responseDeadlineDays: 30
  },
  'NC': {
    code: 'NC', category: 'CONSUMER_DISPUTE',
    description: 'Not Received',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'guest_registration_card', 'key_card_access_log', 'id_verification'
    ],
    responseDeadlineDays: 30
  },
  'NF': {
    code: 'NF', category: 'CONSUMER_DISPUTE',
    description: 'Not as Described / Defective',
    compellingEvidenceTypes: [
      'service_description', 'booking_confirmation', 'folio',
      'guest_correspondence', 'terms_accepted', 'property_photos'
    ],
    responseDeadlineDays: 30
  },
  'PM': {
    code: 'PM', category: 'CONSUMER_DISPUTE',
    description: 'Paid by Other Means',
    compellingEvidenceTypes: ['transaction_log', 'unique_transaction_ids', 'proof_of_separate_charges'],
    responseDeadlineDays: 30
  },
  'RG': {
    code: 'RG', category: 'CONSUMER_DISPUTE',
    description: 'Non-Receipt of Goods or Services',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'signed_registration_card',
      'key_card_access_log', 'folio'
    ],
    responseDeadlineDays: 30
  },
  'RM': {
    code: 'RM', category: 'CONSUMER_DISPUTE',
    description: 'Quality Discrepancy',
    compellingEvidenceTypes: [
      'service_description', 'booking_confirmation', 'folio',
      'guest_correspondence', 'terms_accepted', 'quality_documentation'
    ],
    responseDeadlineDays: 30
  },
  'RN': {
    code: 'RN', category: 'CONSUMER_DISPUTE',
    description: 'Credit Not Received',
    compellingEvidenceTypes: [
      'refund_policy', 'terms_and_conditions', 'no_refund_entitlement',
      'credit_issued_proof', 'cancellation_policy'
    ],
    responseDeadlineDays: 30
  },
  // Unique Discover codes with numeric suffixes
  'UA01': {
    code: 'UA01', category: 'FRAUD',
    description: 'Fraud - Card Present',
    compellingEvidenceTypes: [
      'signed_receipt', 'chip_read_log', 'pin_validation',
      'id_verification', 'surveillance_footage'
    ],
    responseDeadlineDays: 30
  },
  'UA02': {
    code: 'UA02', category: 'FRAUD',
    description: 'Fraud - Card Not Present',
    compellingEvidenceTypes: [
      'avs_cvv_match', 'protectbuy_authentication', 'delivery_confirmation',
      'device_fingerprint', 'ip_address_match', 'prior_undisputed_transactions'
    ],
    responseDeadlineDays: 30
  },
  'UA05': {
    code: 'UA05', category: 'FRAUD',
    description: 'Fraud - Counterfeit Chip Transaction',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'terminal_capability_certificate'],
    responseDeadlineDays: 30
  },
  'UA06': {
    code: 'UA06', category: 'FRAUD',
    description: 'Fraud - Chip-and-PIN Liability Shift',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'pin_validation_log', 'terminal_capability_certificate'],
    responseDeadlineDays: 30
  },
  'UA10': {
    code: 'UA10', category: 'AUTHORIZATION',
    description: 'Request for Copy of Sales Draft',
    compellingEvidenceTypes: ['signed_receipt', 'folio', 'transaction_receipt'],
    responseDeadlineDays: 30
  },
  'UA11': {
    code: 'UA11', category: 'CONSUMER_DISPUTE',
    description: 'Cardholder Claims Cancellation',
    compellingEvidenceTypes: [
      'cancellation_policy', 'no_show_documentation', 'terms_accepted',
      'reservation_confirmation', 'guest_folio', 'booking_confirmation'
    ],
    responseDeadlineDays: 30
  },
  'UA12': {
    code: 'UA12', category: 'CONSUMER_DISPUTE',
    description: 'Non-Receipt of Cash from ATM / Goods/Services Not Received',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'guest_registration_card', 'key_card_access_log'
    ],
    responseDeadlineDays: 30
  }
};

// Discover dispute stages
const DISPUTE_STAGES = {
  RETRIEVAL: 'retrieval',
  FIRST_CHARGEBACK: 'first_chargeback',
  REPRESENTMENT: 'representment',
  PRE_ARBITRATION: 'pre_arbitration',
  ARBITRATION: 'arbitration'
};

// Discover status -> AccuDefend internal status
const STATUS_MAP_FROM_DISCOVER = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending_merchant_response': 'PENDING',
  'retrieval_pending': 'PENDING',
  'under_review': 'IN_REVIEW',
  'issuer_review': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'response_submitted': 'SUBMITTED',
  'pre_arbitration_pending': 'IN_REVIEW',
  'merchant_won': 'WON',
  'representment_accepted': 'WON',
  'chargeback_reversed': 'WON',
  'merchant_lost': 'LOST',
  'representment_declined': 'LOST',
  'chargeback_upheld': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'accepted_by_merchant': 'RESOLVED'
};

// AccuDefend status -> Discover portal status
const STATUS_MAP_TO_DISCOVER = {
  'PENDING': 'open',
  'IN_REVIEW': 'under_review',
  'SUBMITTED': 'representment_filed',
  'WON': 'merchant_won',
  'LOST': 'merchant_lost',
  'EXPIRED': 'expired',
  'RESOLVED': 'closed'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'retrieval.created',
  'retrieval.updated',
  'chargeback.created',
  'chargeback.updated',
  'chargeback.status_changed',
  'representment.accepted',
  'representment.declined',
  'pre_arbitration.initiated',
  'arbitration.initiated'
];


class DiscoverDisputeAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey          - Discover Dispute API key
   * @param {string} config.credentials.merchantId      - Discover Merchant ID
   * @param {string} config.credentials.acquirerBIN     - Acquiring bank BIN
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.credentials.protectBuyMID] - ProtectBuy Merchant ID for 3DS lookups
   * @param {string} [config.baseUrl]                   - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'DISCOVER',
      baseUrl: config.baseUrl || process.env.DISCOVER_API_URL || 'https://api.discover.com'
    });

    this.apiKey = this.credentials.apiKey;
    this.merchantId = this.credentials.merchantId;
    this.acquirerBIN = this.credentials.acquirerBIN;
    this.webhookSecret = this.credentials.webhookSecret || null;
    this.protectBuyMID = this.credentials.protectBuyMID || null;

    // Initialize HTTP client with Discover-specific auth headers
    this._initHttpClient({
      'X-Discover-API-Key': this.apiKey,
      'X-Merchant-ID': this.merchantId,
      'X-Acquirer-BIN': this.acquirerBIN
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with the Discover Dispute Management API.
   * Discover uses API Key authentication. This method validates the credentials
   * by making a lightweight API call.
   *
   * @returns {Promise<Object>} { authenticated, merchantId, acquirerBIN }
   */
  async authenticate() {
    logger.info(`[Discover] Authenticating Merchant ID: ${this.merchantId}`);

    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/api/v1/merchant/profile', {
          params: { merchantId: this.merchantId }
        })
      );

      const profile = response.data;

      logger.info(`[Discover] Authentication successful for Merchant: ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        acquirerBIN: this.acquirerBIN,
        merchantName: profile.merchantName || '',
        protectBuyEnabled: profile.protectBuyEnabled || false,
        apiVersion: 'v1'
      };
    } catch (error) {
      logger.error('[Discover] Authentication failed:', this._extractErrorMessage(error));
      throw new Error(`Discover authentication failed: ${this._extractErrorMessage(error)}`);
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Discover
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from Discover.
   * Handles retrievals (pre-chargeback), chargebacks, and pre-arbitration cases.
   * Discover often initiates with a retrieval request before a formal chargeback.
   *
   * @param {Object} disputeData - Raw Discover dispute payload
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[Discover] Receiving dispute: ${disputeData.caseId || disputeData.disputeId || disputeData.retrievalId}`);

    const normalized = this.normalizeDispute(disputeData);

    // Enrich with ProtectBuy data if available (Discover's 3DS implementation)
    if (this.protectBuyMID && normalized.transactionId) {
      try {
        const protectBuyData = await this._lookupProtectBuyData(normalized.transactionId);
        if (protectBuyData) {
          normalized.protectBuyData = protectBuyData;
          normalized.protectBuyAuthenticated = protectBuyData.authenticationStatus === 'authenticated';
        }
      } catch (err) {
        logger.warn(`[Discover] ProtectBuy lookup failed for transaction ${normalized.transactionId}: ${err.message}`);
      }
    }

    // Calculate response deadline (Discover uses 30-day window)
    if (!normalized.dueDate) {
      normalized.dueDate = this._calculateResponseDeadline(
        normalized.disputeDate,
        normalized.disputeStage,
        normalized.reasonCode
      );
    }

    logger.info(`[Discover] Dispute normalized: ${normalized.disputeId} | Stage: ${normalized.disputeStage} | Reason: ${normalized.reasonCode} | Due: ${normalized.dueDate}`);
    return normalized;
  }

  /**
   * Query Discover for the current status of a dispute.
   *
   * @param {string} disputeId - Discover case identifier
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
      stage: data.stage || data.disputeStage || DISPUTE_STAGES.FIRST_CHARGEBACK,
      lastUpdated: data.lastModifiedDate || data.updatedAt,
      notes: data.statusNotes || data.notes || '',
      outcome: data.outcome || null,
      outcomeDate: data.resolutionDate || null,
      financialImpact: data.financialImpact || null,
      issuerResponse: data.issuerResponseDescription || null,
      daysRemaining: data.daysRemaining || null
    };
  }

  /**
   * Retrieve evidence requirements for a Discover dispute.
   *
   * @param {string} disputeId - Discover case identifier
   * @returns {Promise<Object>} Evidence requirements
   */
  async getEvidenceRequirements(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v1/disputes/${disputeId}`)
    );

    const dispute = response.data;
    const reasonCode = dispute.reasonCode || dispute.chargebackReasonCode;
    const reasonInfo = DISCOVER_REASON_CODES[reasonCode] || {};

    const portalRequired = dispute.requiredDocumentTypes || [];
    const reasonRequired = reasonInfo.compellingEvidenceTypes || [];
    const allRequired = [...new Set([...portalRequired, ...reasonRequired])];

    return {
      disputeId,
      requiredTypes: allRequired,
      portalRequiredTypes: portalRequired,
      recommendedTypes: reasonRequired,
      deadline: dispute.responseDeadline || dispute.dueDate,
      deadlineDays: reasonInfo.responseDeadlineDays || 30,
      instructions: dispute.evidenceInstructions || this._getDefaultEvidenceInstructions(reasonCode),
      reasonCode,
      reasonCategory: reasonInfo.category || 'UNKNOWN',
      stage: dispute.stage || DISPUTE_STAGES.FIRST_CHARGEBACK,
      isRetrieval: dispute.stage === DISPUTE_STAGES.RETRIEVAL || !!dispute.retrievalId,
      protectBuyRelevant: ['FR', 'UA01', 'UA02'].includes(reasonCode)
    };
  }

  /**
   * Fetch a paginated list of disputes from Discover.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Paginated dispute list
   */
  async listDisputes(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      endDate: params.until || undefined,
      status: params.status || undefined,
      stage: params.stage || undefined,
      reasonCode: params.reasonCode || undefined,
      merchantId: this.merchantId,
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
  // OUTBOUND: Send TO Discover
  // ===========================================================================

  /**
   * Submit evidence documents to Discover for a dispute case.
   *
   * @param {string} disputeId - Discover case identifier
   * @param {Object} evidence  - Evidence package with files and metadata
   * @returns {Promise<Object>} Submission result
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
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
        cardholderName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authorizationCode: metadata.authorizationCode
      },
      protectBuyData: metadata.protectBuyData || null,
      merchantNotes: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('discover_evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/documents`, payload)
    );

    logger.info(`[Discover] Evidence submitted for case ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Discover for a disputed chargeback.
   *
   * @param {string} disputeId    - Discover case identifier
   * @param {Object} responseData - Representment response details
   * @returns {Promise<Object>}   Result of representment filing
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      responseType: responseData.representmentType || 'representment',
      disputeStage: responseData.stage || DISPUTE_STAGES.REPRESENTMENT,
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        protectBuyAuthentication: responseData.compellingEvidence?.protectBuyData || null,
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceFingerprint: responseData.compellingEvidence?.deviceFingerprint || null,
        ipAddress: responseData.compellingEvidence?.ipAddress || null
      },
      guestDetails: {
        cardholderName: responseData.guestDetails?.name,
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
        earlyCheckout: responseData.stayDetails?.earlyCheckout || false,
        folioNumber: responseData.stayDetails?.folioNumber || null
      },
      documentIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('discover_response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/respond`, payload)
    );

    logger.info(`[Discover] Representment filed for case ${disputeId} (stage: ${payload.disputeStage})`);

    return {
      responseId: response.data.responseId || response.data.representmentId || response.data.id,
      status: response.data.status || 'filed',
      stage: payload.disputeStage,
      message: response.data.message || 'Representment filed successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a Discover dispute (do not contest).
   *
   * @param {string} disputeId - Discover case identifier
   * @returns {Promise<Object>} Acceptance result
   */
  async acceptDispute(disputeId) {
    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      action: 'accept_liability',
      merchantNotes: 'Liability accepted by merchant via AccuDefend',
      idempotencyKey: this._generateIdempotencyKey('discover_accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/accept`, payload)
    );

    logger.info(`[Discover] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute liability accepted'
    };
  }

  // ===========================================================================
  // RETRIEVAL REQUESTS
  // ===========================================================================

  /**
   * Respond to a Discover retrieval request.
   * Retrievals are pre-chargeback information requests from the issuer.
   * Providing transaction details can prevent the retrieval from becoming a chargeback.
   *
   * @param {string} retrievalId   - Discover retrieval request identifier
   * @param {Object} retrievalData - Retrieval response data
   * @returns {Promise<Object>}    Response result
   */
  async respondToRetrieval(retrievalId, retrievalData) {
    const payload = {
      retrievalId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      responseType: 'retrieval_response',
      transactionDetails: {
        cardholderName: retrievalData.guestName,
        confirmationNumber: retrievalData.confirmationNumber,
        checkInDate: retrievalData.checkInDate,
        checkOutDate: retrievalData.checkOutDate,
        transactionAmount: retrievalData.transactionAmount,
        transactionDate: retrievalData.transactionDate,
        authorizationCode: retrievalData.authorizationCode,
        merchantDescriptor: retrievalData.merchantDescriptor || '',
        itemizedCharges: retrievalData.itemizedCharges || [],
        folioNumber: retrievalData.folioNumber || null
      },
      documentIds: retrievalData.evidenceIds || [],
      merchantExplanation: retrievalData.explanation || '',
      creditOffered: retrievalData.creditOffered || false,
      creditAmount: retrievalData.creditAmount || null,
      idempotencyKey: this._generateIdempotencyKey('discover_retrieval')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/retrievals/${retrievalId}/respond`, payload)
    );

    logger.info(`[Discover] Retrieval ${retrievalId} responded (credit offered: ${payload.creditOffered})`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'responded',
      message: response.data.message || 'Retrieval response submitted',
      preventedChargeback: response.data.preventedChargeback || false,
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Fetch a list of pending retrieval requests from Discover.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} List of retrieval requests
   */
  async fetchRetrievals(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      endDate: params.until || undefined,
      status: params.status || 'pending',
      merchantId: this.merchantId,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/api/v1/retrievals', { params: queryParams })
    );

    const data = response.data;
    const retrievals = data.retrievals || data.data || [];

    return {
      retrievals: retrievals.map((r) => this._normalizeRetrieval(r)),
      totalCount: data.totalCount || retrievals.length,
      hasMore: data.hasMore || false,
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // PRE-ARBITRATION
  // ===========================================================================

  /**
   * Respond to a pre-arbitration case on Discover.
   * Pre-arbitration occurs when the issuer rejects the representment.
   *
   * @param {string} disputeId   - Discover case identifier
   * @param {Object} preArbData  - Pre-arbitration response data
   * @returns {Promise<Object>}  Result of pre-arbitration response
   */
  async respondToPreArbitration(disputeId, preArbData) {
    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      stage: DISPUTE_STAGES.PRE_ARBITRATION,
      action: preArbData.action || 'contest',
      preArbitrationReason: preArbData.reason || '',
      additionalDocumentIds: preArbData.evidenceIds || [],
      merchantNarrative: preArbData.narrative || '',
      escalateToArbitration: preArbData.escalateToArbitration || false,
      idempotencyKey: this._generateIdempotencyKey('discover_prearb')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v1/disputes/${disputeId}/pre-arbitration`, payload)
    );

    logger.info(`[Discover] Pre-arbitration response filed for case ${disputeId} (action: ${payload.action})`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'filed',
      stage: DISPUTE_STAGES.PRE_ARBITRATION,
      message: response.data.message || 'Pre-arbitration response filed',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // PROTECTBUY (3-D SECURE) LOOKUPS
  // ===========================================================================

  /**
   * Look up ProtectBuy (Discover's 3-D Secure) authentication data for a transaction.
   * ProtectBuy data is critical evidence for fraud disputes (FR, UA01, UA02).
   *
   * @param {string} transactionId - Transaction identifier
   * @returns {Promise<Object|null>} ProtectBuy authentication data or null
   * @private
   */
  async _lookupProtectBuyData(transactionId) {
    if (!this.protectBuyMID) return null;

    try {
      const response = await this._withRetry(() =>
        this.httpClient.get(`/api/v1/protectbuy/transactions/${transactionId}`, {
          params: { merchantId: this.merchantId, protectBuyMID: this.protectBuyMID }
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
        liabilityShift: data.liabilityShift || false,
        protectBuyIndicator: data.protectBuyIndicator || ''
      };
    } catch (error) {
      logger.warn(`[Discover] ProtectBuy lookup failed for ${transactionId}: ${this._extractErrorMessage(error)}`);
      return null;
    }
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Discover webhook payload.
   * Discover sends webhooks as JSON with structure:
   *   { eventType, caseId, payload, timestamp, hmacSignature }
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
        logger.error('[Discover] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Discover webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Discover] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Discover webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify HMAC signature if webhook secret is configured
    const signature = headers['x-discover-hmac-signature'] || headers['x-discover-signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Discover] Webhook signature verification failed');
        throw new Error('Invalid Discover webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event,
      disputeId: parsed.caseId || parsed.disputeId || parsed.retrievalId,
      data: parsed.payload || parsed.data || parsed,
      timestamp: parsed.timestamp || headers['x-discover-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-discover-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Discover for event notifications.
   *
   * @param {Object} config - Webhook registration configuration
   * @returns {Promise<Object>} Registration result
   */
  async registerWebhook(config) {
    const callbackUrl = typeof config === 'string' ? config : config.callbackUrl;
    const events = (typeof config === 'object' && config.events) ? config.events : WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
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

    logger.info(`[Discover] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a Discover dispute/retrieval into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw Discover dispute data
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.caseId || portalData.disputeId || portalData.retrievalId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.disputeAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    // Determine dispute stage
    let disputeStage = DISPUTE_STAGES.FIRST_CHARGEBACK;
    if (portalData.retrievalId || portalData.stage === 'retrieval') {
      disputeStage = DISPUTE_STAGES.RETRIEVAL;
    } else if (portalData.stage) {
      disputeStage = portalData.stage;
    }

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedPAN?.slice(-4) || '',
      cardBrand: 'DISCOVER',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.disputeDate || portalData.chargebackDate || portalData.retrievalDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status || portalData.caseStatus),
      portalStatus: portalData.status || portalData.caseStatus,
      disputeStage,
      alertType: disputeStage === DISPUTE_STAGES.RETRIEVAL ? 'RETRIEVAL' : 'CHARGEBACK',
      isPreChargeback: disputeStage === DISPUTE_STAGES.RETRIEVAL,
      transactionId: portalData.transactionId || portalData.networkReferenceNumber || '',
      transactionDate: portalData.transactionDate || null,
      authorizationCode: portalData.authorizationCode || portalData.approvalCode || '',
      networkReferenceNumber: portalData.networkReferenceNumber || portalData.nrn || '',
      protectBuyAuthenticated: portalData.protectBuyAuthenticated || false,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'DISCOVER',
      rawData: portalData
    };
  }

  /**
   * Map a Discover status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Discover status value
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_DISCOVER[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Discover reason code to a structured object with category and description.
   * Discover uses a unique two-letter (+ optional numeric) reason code format.
   *
   * @param {string} portalCode - Discover reason code (e.g. 'AA', 'FR', 'UA02')
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase();
    const known = DISCOVER_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    // Attempt to categorize unknown codes by prefix pattern
    if (normalized.startsWith('UA')) {
      return { code: normalized, category: 'FRAUD', description: `Discover Fraud/Auth - Code ${normalized}` };
    }
    if (normalized.startsWith('FR') || normalized.startsWith('F')) {
      return { code: normalized, category: 'FRAUD', description: `Discover Fraud - Code ${normalized}` };
    }
    if (['DA', 'NA', 'AA', 'AW'].includes(normalized) || normalized.startsWith('A')) {
      return { code: normalized, category: 'AUTHORIZATION', description: `Discover Authorization - Code ${normalized}` };
    }
    if (['CD', 'DP', 'EX', 'LP'].includes(normalized)) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Discover Processing Error - Code ${normalized}` };
    }
    if (['NC', 'NF', 'PM', 'RG', 'RM', 'RN', 'IN', 'AP'].includes(normalized)) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Discover Consumer Dispute - Code ${normalized}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Discover Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Discover Dispute API.
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
        message: 'Discover Dispute API is reachable',
        details: {
          portalType: 'DISCOVER',
          merchantId: this.merchantId,
          acquirerBIN: this.acquirerBIN,
          protectBuyEnabled: !!this.protectBuyMID,
          apiVersion: 'v1',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Discover health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'DISCOVER',
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
   * Normalize a Discover retrieval request into a structured object.
   *
   * @param {Object} retrieval - Raw retrieval data from Discover
   * @returns {Object} Normalized retrieval object
   * @private
   */
  _normalizeRetrieval(retrieval) {
    return {
      retrievalId: retrieval.retrievalId || retrieval.id,
      caseNumber: retrieval.caseNumber || null,
      status: retrieval.status || 'pending',
      retrievalDate: retrieval.retrievalDate || retrieval.createdAt,
      responseDeadline: retrieval.responseDeadline || null,
      transactionId: retrieval.transactionId || '',
      transactionDate: retrieval.transactionDate || '',
      transactionAmount: parseFloat(retrieval.transactionAmount || retrieval.amount || 0),
      currency: retrieval.currency || 'USD',
      cardLastFour: retrieval.cardLastFour || retrieval.cardLast4 || '',
      cardholderName: retrieval.cardholderName || '',
      reasonCode: retrieval.reasonCode || '',
      merchantDescriptor: retrieval.merchantDescriptor || '',
      issuerName: retrieval.issuerName || '',
      requestType: retrieval.requestType || 'copy_request',
      rawData: retrieval
    };
  }

  /**
   * Calculate the response deadline for a Discover dispute.
   * Discover uses a 30-day response window for most dispute types.
   *
   * @param {string} disputeDate  - ISO date of the dispute
   * @param {string} stage        - Dispute stage
   * @param {string} reasonCode   - Discover reason code
   * @returns {string} ISO date of the response deadline
   * @private
   */
  _calculateResponseDeadline(disputeDate, stage, reasonCode) {
    const baseDate = new Date(disputeDate || Date.now());
    const reasonInfo = DISCOVER_REASON_CODES[reasonCode] || {};
    let deadlineDays = reasonInfo.responseDeadlineDays || 30;

    // Adjust deadline based on dispute stage
    switch (stage) {
      case DISPUTE_STAGES.RETRIEVAL:
        deadlineDays = 20; // Retrievals have shorter window
        break;
      case DISPUTE_STAGES.PRE_ARBITRATION:
        deadlineDays = 30;
        break;
      case DISPUTE_STAGES.ARBITRATION:
        deadlineDays = 10;
        break;
      default:
        break;
    }

    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + deadlineDays);
    return deadline.toISOString();
  }

  /**
   * Return default evidence instructions based on the Discover reason code.
   *
   * @param {string} reasonCode - Discover reason code
   * @returns {string} Evidence instructions
   * @private
   */
  _getDefaultEvidenceInstructions(reasonCode) {
    const instructions = {
      'AA': 'Provide proof the cardholder recognizes this transaction: signed registration card, ' +
            'check-in confirmation, booking confirmation email sent to cardholder, ' +
            'guest folio, and ID verification records.',
      'AP': 'Provide signed recurring billing agreement with cancellation terms, ' +
            'proof that no cancellation request was received prior to the charge, ' +
            'and the terms and conditions accepted by the cardholder.',
      'FR': 'Provide compelling evidence for fraud dispute: signed receipt, chip read log, ' +
            'AVS/CVV match, ProtectBuy (3DS) authentication data, device fingerprint, ' +
            'and prior undisputed transactions.',
      'NC': 'Provide proof the cardholder received the services: check-in confirmation, ' +
            'signed registration card, key card access logs, room folio, and ID verification.',
      'NF': 'Provide booking confirmation showing services as advertised, guest folio, ' +
            'property photos, terms accepted at booking, and any guest correspondence.',
      'RN': 'Provide refund policy accepted by cardholder, proof no cancellation was received, ' +
            'or proof that a credit has already been processed.',
      'UA02': 'Provide compelling evidence for card-not-present fraud: AVS/CVV match data, ' +
              'ProtectBuy (3DS) authentication, delivery confirmation, device fingerprint, ' +
              'IP address logs, and prior undisputed transactions.',
      'UA11': 'Provide cancellation policy accepted at booking, no-show documentation, ' +
              'reservation confirmation with terms, and guest folio. ' +
              'Discover requires proof the cancellation policy was clearly communicated.'
    };

    return instructions[reasonCode] ||
      'Submit all available evidence including guest folio, signed registration, ' +
      'booking confirmation, authorization records, and ProtectBuy data if applicable. ' +
      'Discover requires responses within 30 days of the dispute date.';
  }
}

module.exports = DiscoverDisputeAdapter;
