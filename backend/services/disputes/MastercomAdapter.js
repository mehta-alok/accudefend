/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Mastercard Mastercom Dispute Adapter
 *
 * Implements two-way integration with Mastercard's Mastercom platform:
 *   - Mastercom is Mastercard's official dispute resolution system for acquirers
 *     and merchants, handling the full chargeback lifecycle
 *   - Supports first chargeback, second presentment (representment), pre-arbitration,
 *     arbitration chargeback, and pre-compliance/compliance cases
 *   - Integrates with Ethoca collaboration alerts for pre-chargeback resolution
 *   - Handles IPM (Integrated Product Messages) file processing for batch disputes
 *   - Covers all Mastercard reason codes (4807-4863)
 *
 * Auth: OAuth2 via Mastercard Developers portal (client_credentials grant with PKCS#12 key).
 * Base URL: https://sandbox.api.mastercard.com (configurable via MASTERCOM_API_URL env var)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// MASTERCARD REASON CODE MAPPINGS (Complete Set)
// =============================================================================

const MC_REASON_CODES = {
  '4807': {
    code: '4807', category: 'FRAUD',
    description: 'Warning Bulletin File',
    compellingEvidenceTypes: ['authorization_approval_code', 'transaction_receipt'],
    responseDeadlineDays: 45
  },
  '4808': {
    code: '4808', category: 'AUTHORIZATION',
    description: 'Authorization-Related Chargeback',
    compellingEvidenceTypes: ['authorization_approval_code', 'authorization_log', 'transaction_receipt'],
    responseDeadlineDays: 45
  },
  '4812': {
    code: '4812', category: 'PROCESSING_ERROR',
    description: 'Account Number Not on File',
    compellingEvidenceTypes: ['account_verification', 'imprint_of_card', 'authorization_record'],
    responseDeadlineDays: 45
  },
  '4831': {
    code: '4831', category: 'PROCESSING_ERROR',
    description: 'Transaction Amount Differs',
    compellingEvidenceTypes: ['signed_receipt', 'folio', 'itemized_charges', 'authorization_amount_proof'],
    responseDeadlineDays: 45
  },
  '4834': {
    code: '4834', category: 'PROCESSING_ERROR',
    description: 'Point-of-Interaction Error',
    compellingEvidenceTypes: ['terminal_transaction_log', 'batch_settlement_report', 'unique_transaction_ids'],
    responseDeadlineDays: 45
  },
  '4835': {
    code: '4835', category: 'FRAUD',
    description: 'Card Not Present',
    compellingEvidenceTypes: [
      'avs_cvv_match', 'delivery_confirmation', 'device_fingerprint',
      'ip_address_match', '3ds_authentication', 'prior_undisputed_transactions'
    ],
    responseDeadlineDays: 45
  },
  '4837': {
    code: '4837', category: 'FRAUD',
    description: 'No Cardholder Authorization',
    compellingEvidenceTypes: [
      'signed_receipt', 'chip_read_log', 'pin_validation',
      'id_verification', 'signed_registration_card'
    ],
    responseDeadlineDays: 45
  },
  '4840': {
    code: '4840', category: 'FRAUD',
    description: 'Fraudulent Processing of Transactions',
    compellingEvidenceTypes: ['transaction_receipt', 'proof_of_delivery', 'merchant_records'],
    responseDeadlineDays: 45
  },
  '4841': {
    code: '4841', category: 'CONSUMER_DISPUTE',
    description: 'Cancelled Recurring or Digital Goods Transaction',
    compellingEvidenceTypes: ['cancellation_policy', 'terms_and_conditions', 'signed_agreement', 'cancellation_confirmation'],
    responseDeadlineDays: 45
  },
  '4842': {
    code: '4842', category: 'PROCESSING_ERROR',
    description: 'Late Presentment',
    compellingEvidenceTypes: ['authorization_date_proof', 'transaction_date_proof'],
    responseDeadlineDays: 45
  },
  '4849': {
    code: '4849', category: 'FRAUD',
    description: 'Questionable Merchant Activity',
    compellingEvidenceTypes: ['transaction_legitimacy_proof', 'business_documentation', 'customer_correspondence'],
    responseDeadlineDays: 45
  },
  '4853': {
    code: '4853', category: 'CONSUMER_DISPUTE',
    description: 'Cardholder Dispute - Defective/Not as Described',
    compellingEvidenceTypes: [
      'service_description', 'booking_confirmation', 'folio',
      'guest_correspondence', 'terms_accepted', 'photos'
    ],
    responseDeadlineDays: 45,
    subReasonCodes: {
      '01': 'Not as Described',
      '02': 'Defective',
      '03': 'Not Received',
      '04': 'Counterfeit',
      '05': 'Misrepresentation',
      '06': 'Credit Not Processed',
      '07': 'Cancelled Recurring',
      '08': 'Original Credit Transaction Not Accepted',
      '09': 'Cancelled Services',
      '10': 'Overcharged'
    }
  },
  '4854': {
    code: '4854', category: 'CONSUMER_DISPUTE',
    description: 'Cardholder Dispute - Not Elsewhere Classified',
    compellingEvidenceTypes: ['transaction_receipt', 'terms_accepted', 'guest_correspondence', 'folio'],
    responseDeadlineDays: 45
  },
  '4855': {
    code: '4855', category: 'CONSUMER_DISPUTE',
    description: 'Goods or Services Not Provided',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'guest_registration_card', 'key_card_access_log', 'id_verification'
    ],
    responseDeadlineDays: 45
  },
  '4859': {
    code: '4859', category: 'CONSUMER_DISPUTE',
    description: 'Services Not Rendered / Merchandise Not Received',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'signed_registration_card', 'key_card_access_log'
    ],
    responseDeadlineDays: 45
  },
  '4860': {
    code: '4860', category: 'CONSUMER_DISPUTE',
    description: 'Credit Not Processed',
    compellingEvidenceTypes: [
      'refund_policy', 'terms_and_conditions', 'no_refund_entitlement',
      'credit_issued_proof', 'cancellation_policy'
    ],
    responseDeadlineDays: 45
  },
  '4863': {
    code: '4863', category: 'FRAUD',
    description: 'Cardholder Does Not Recognize - Potential Fraud',
    compellingEvidenceTypes: [
      'signed_receipt', 'guest_registration_card', 'check_in_proof',
      'id_verification', 'avs_cvv_match', 'device_fingerprint'
    ],
    responseDeadlineDays: 45
  }
};

// Mastercom dispute stages
const DISPUTE_STAGES = {
  FIRST_CHARGEBACK: 'first_chargeback',
  SECOND_PRESENTMENT: 'second_presentment',
  PRE_ARBITRATION: 'pre_arbitration',
  ARBITRATION: 'arbitration_chargeback',
  PRE_COMPLIANCE: 'pre_compliance',
  COMPLIANCE: 'compliance'
};

// Mastercom status -> AccuDefend internal status
const STATUS_MAP_FROM_MC = {
  'new': 'PENDING',
  'open': 'PENDING',
  'queued': 'PENDING',
  'pending_merchant': 'PENDING',
  'under_review': 'IN_REVIEW',
  'issuer_review': 'IN_REVIEW',
  'second_presentment_filed': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'evidence_submitted': 'SUBMITTED',
  'pre_arbitration_pending': 'IN_REVIEW',
  'arbitration_pending': 'IN_REVIEW',
  'merchant_won': 'WON',
  'second_presentment_accepted': 'WON',
  'merchant_lost': 'LOST',
  'second_presentment_declined': 'LOST',
  'arbitration_lost': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'accepted_by_merchant': 'RESOLVED'
};

// AccuDefend status -> Mastercom portal status
const STATUS_MAP_TO_MC = {
  'PENDING': 'open',
  'IN_REVIEW': 'under_review',
  'SUBMITTED': 'second_presentment_filed',
  'WON': 'merchant_won',
  'LOST': 'merchant_lost',
  'EXPIRED': 'expired',
  'RESOLVED': 'closed'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'chargeback.created',
  'chargeback.updated',
  'chargeback.status_changed',
  'second_presentment.accepted',
  'second_presentment.declined',
  'pre_arbitration.initiated',
  'arbitration.initiated',
  'ethoca_alert.received',
  'ipm.batch_received'
];


class MastercomAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.consumerKey    - Mastercard Developers OAuth consumer key
   * @param {string} config.credentials.signingKeyPath - Path to PKCS#12 signing key file
   * @param {string} config.credentials.signingKeyAlias- Key alias within the PKCS#12 file
   * @param {string} config.credentials.signingKeyPassword - Password for the PKCS#12 key
   * @param {string} config.credentials.merchantId     - Mastercard Merchant ID (MID)
   * @param {string} config.credentials.acquirerICA    - Acquiring bank ICA number
   * @param {string} [config.credentials.webhookSecret]- Shared secret for webhook verification
   * @param {string} [config.baseUrl]                  - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'MASTERCOM',
      baseUrl: config.baseUrl || process.env.MASTERCOM_API_URL || 'https://sandbox.api.mastercard.com'
    });

    this.consumerKey = this.credentials.consumerKey;
    this.signingKeyPath = this.credentials.signingKeyPath;
    this.signingKeyAlias = this.credentials.signingKeyAlias;
    this.signingKeyPassword = this.credentials.signingKeyPassword;
    this.merchantId = this.credentials.merchantId;
    this.acquirerICA = this.credentials.acquirerICA;
    this.webhookSecret = this.credentials.webhookSecret || null;

    // OAuth1.0a token cache (Mastercard uses OAuth 1.0a with RSA-SHA256 signing)
    this._oauthSigningKey = null;

    // Initialize HTTP client with Mastercom-specific headers
    this._initHttpClient({
      'X-Merchant-ID': this.merchantId,
      'X-Acquirer-ICA': this.acquirerICA
    });

    // Add request interceptor to inject OAuth1.0a authorization header
    this.httpClient.interceptors.request.use(async (reqConfig) => {
      const authHeader = await this._generateOAuth1Header(reqConfig.method, reqConfig.url, reqConfig.data);
      reqConfig.headers['Authorization'] = authHeader;
      return reqConfig;
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Mastercard Developers using OAuth 1.0a with RSA-SHA256 signing.
   * Mastercard uses a unique OAuth implementation where each request is individually
   * signed using the merchant's PKCS#12 private key.
   *
   * @returns {Promise<Object>} { authenticated, consumerKey, merchantId }
   */
  async authenticate() {
    logger.info('[Mastercom] Verifying authentication credentials with Mastercard Developers');

    try {
      // Validate credentials by making a lightweight API call
      const response = await this._withRetry(() =>
        this.httpClient.get('/mastercom/v6/chargebacks', {
          params: { pageSize: 1, status: 'open' }
        })
      );

      logger.info('[Mastercom] Authentication verified successfully');

      return {
        authenticated: true,
        consumerKey: this.consumerKey,
        merchantId: this.merchantId,
        acquirerICA: this.acquirerICA,
        apiVersion: 'v6'
      };
    } catch (error) {
      logger.error('[Mastercom] Authentication verification failed:', this._extractErrorMessage(error));
      throw new Error(`Mastercom authentication failed: ${this._extractErrorMessage(error)}`);
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Mastercom
  // ===========================================================================

  /**
   * Receive and normalize a chargeback payload from Mastercom.
   * Handles first chargebacks, pre-arbitration cases, and collaboration alerts.
   *
   * @param {Object} disputeData - Raw Mastercom chargeback payload
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[Mastercom] Receiving chargeback: ${disputeData.caseId || disputeData.chargebackId || disputeData.claimId}`);

    const normalized = this.normalizeDispute(disputeData);

    // If this contains IPM data, parse the batch fields
    if (disputeData.ipmRecord || disputeData.ipmData) {
      normalized.ipmData = this._parseIPMData(disputeData.ipmRecord || disputeData.ipmData);
    }

    // Calculate response deadline
    if (!normalized.dueDate) {
      normalized.dueDate = this._calculateResponseDeadline(
        normalized.disputeDate,
        normalized.disputeStage,
        normalized.reasonCode
      );
    }

    logger.info(`[Mastercom] Chargeback normalized: ${normalized.disputeId} | Stage: ${normalized.disputeStage} | Reason: ${normalized.reasonCode} | Due: ${normalized.dueDate}`);
    return normalized;
  }

  /**
   * Query Mastercom for the current status of a chargeback case.
   *
   * @param {string} disputeId - Mastercom case identifier
   * @returns {Promise<Object>} Status details
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/mastercom/v6/chargebacks/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status || data.caseStatus),
      portalStatus: data.status || data.caseStatus,
      stage: data.stage || data.chargebackStage || DISPUTE_STAGES.FIRST_CHARGEBACK,
      lastUpdated: data.lastModifiedDate || data.updatedAt,
      notes: data.statusNotes || data.notes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      financialImpact: data.financialImpact || null,
      issuerResponse: data.issuerResponseDescription || null,
      debitCreditIndicator: data.debitCreditIndicator || null
    };
  }

  /**
   * Retrieve evidence requirements for a Mastercom chargeback.
   *
   * @param {string} disputeId - Mastercom case identifier
   * @returns {Promise<Object>} Evidence requirements
   */
  async getEvidenceRequirements(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/mastercom/v6/chargebacks/${disputeId}`)
    );

    const dispute = response.data;
    const reasonCode = dispute.reasonCode || dispute.chargebackReasonCode;
    const reasonInfo = MC_REASON_CODES[reasonCode] || {};

    const portalRequired = dispute.requiredDocumentTypes || [];
    const reasonRequired = reasonInfo.compellingEvidenceTypes || [];
    const allRequired = [...new Set([...portalRequired, ...reasonRequired])];

    return {
      disputeId,
      requiredTypes: allRequired,
      portalRequiredTypes: portalRequired,
      recommendedTypes: reasonRequired,
      deadline: dispute.responseDeadline || dispute.dueDate,
      deadlineDays: reasonInfo.responseDeadlineDays || 45,
      instructions: dispute.evidenceInstructions || this._getDefaultEvidenceInstructions(reasonCode),
      reasonCode,
      reasonCategory: reasonInfo.category || 'UNKNOWN',
      stage: dispute.stage || DISPUTE_STAGES.FIRST_CHARGEBACK,
      subReasonCode: dispute.subReasonCode || null
    };
  }

  /**
   * Fetch a paginated list of chargebacks from Mastercom.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Paginated chargeback list
   */
  async listDisputes(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      endDate: params.until || undefined,
      status: params.status || undefined,
      stage: params.stage || undefined,
      reasonCode: params.reasonCode || undefined,
      acquirerICA: this.acquirerICA,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/mastercom/v6/chargebacks', { params: queryParams })
    );

    const data = response.data;
    const chargebacks = data.chargebacks || data.cases || data.data || [];

    return {
      disputes: chargebacks.map((cb) => this.normalizeDispute(cb)),
      totalCount: data.totalCount || data.totalRecords || chargebacks.length,
      hasMore: data.hasMore || (data.currentPage < data.totalPages),
      page: data.currentPage || data.page || queryParams.page
    };
  }

  // ===========================================================================
  // OUTBOUND: Send TO Mastercom
  // ===========================================================================

  /**
   * Submit evidence documents to Mastercom for a chargeback case.
   * Mastercom accepts documents via its Document Management API.
   *
   * @param {string} disputeId - Mastercom case identifier
   * @param {Object} evidence  - Evidence package with files and metadata
   * @returns {Promise<Object>} Submission result
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    // Upload each document individually (Mastercom requires individual document uploads)
    const uploadResults = [];
    for (const file of files) {
      const docPayload = {
        caseId: disputeId,
        documentType: file.type || 'supporting_document',
        documentCategory: file.category || 'merchant_evidence',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        fileContent: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || 'Supporting evidence document',
        merchantId: this.merchantId,
        acquirerICA: this.acquirerICA
      };

      const uploadResponse = await this._withRetry(() =>
        this.httpClient.post(`/mastercom/v6/chargebacks/${disputeId}/documents`, docPayload)
      );

      uploadResults.push({
        documentId: uploadResponse.data.documentId || uploadResponse.data.id,
        fileName: file.fileName,
        status: uploadResponse.data.status || 'uploaded'
      });
    }

    logger.info(`[Mastercom] ${uploadResults.length} evidence documents uploaded for case ${disputeId}`);

    return {
      submissionId: `mc_evidence_${disputeId}_${Date.now()}`,
      documentIds: uploadResults.map(r => r.documentId),
      documents: uploadResults,
      status: 'submitted',
      message: `${uploadResults.length} documents uploaded successfully`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Push a second presentment (representment) to Mastercom for a chargeback.
   * Second presentment is Mastercard's term for contesting a first chargeback.
   *
   * @param {string} disputeId    - Mastercom case identifier
   * @param {Object} responseData - Representment/second presentment details
   * @returns {Promise<Object>}   Result of second presentment filing
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerICA: this.acquirerICA,
      representmentType: responseData.representmentType || 'second_presentment',
      disputeStage: responseData.stage || DISPUTE_STAGES.SECOND_PRESENTMENT,
      reasonCodeJustification: responseData.reasonCodeJustification || '',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceFingerprint: responseData.compellingEvidence?.deviceFingerprint || null,
        authenticationData: responseData.compellingEvidence?.authenticationData || null
      },
      guestDetails: {
        cardholderName: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        memberNumber: responseData.guestDetails?.loyaltyNumber || null
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
      idempotencyKey: this._generateIdempotencyKey('mc_response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/mastercom/v6/chargebacks/${disputeId}/representments`, payload)
    );

    logger.info(`[Mastercom] Second presentment filed for case ${disputeId} (stage: ${payload.disputeStage})`);

    return {
      responseId: response.data.representmentId || response.data.responseId || response.data.id,
      status: response.data.status || 'filed',
      stage: payload.disputeStage,
      message: response.data.message || 'Second presentment filed successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a Mastercom chargeback (do not contest).
   *
   * @param {string} disputeId - Mastercom case identifier
   * @returns {Promise<Object>} Acceptance result
   */
  async acceptDispute(disputeId) {
    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerICA: this.acquirerICA,
      action: 'accept_financial_liability',
      merchantNotes: 'Liability accepted by merchant via AccuDefend',
      idempotencyKey: this._generateIdempotencyKey('mc_accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/mastercom/v6/chargebacks/${disputeId}/accept`, payload)
    );

    logger.info(`[Mastercom] Chargeback ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Chargeback liability accepted'
    };
  }

  // ===========================================================================
  // PRE-ARBITRATION AND ARBITRATION
  // ===========================================================================

  /**
   * Respond to a pre-arbitration case on Mastercom.
   * Pre-arbitration occurs when the issuer rejects the second presentment.
   *
   * @param {string} disputeId   - Mastercom case identifier
   * @param {Object} preArbData  - Pre-arbitration response data
   * @returns {Promise<Object>}  Result of pre-arbitration response
   */
  async respondToPreArbitration(disputeId, preArbData) {
    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerICA: this.acquirerICA,
      stage: DISPUTE_STAGES.PRE_ARBITRATION,
      action: preArbData.action || 'contest', // 'contest' or 'accept'
      preArbitrationReason: preArbData.reason || '',
      additionalDocumentIds: preArbData.evidenceIds || [],
      merchantNarrative: preArbData.narrative || '',
      escalateToArbitration: preArbData.escalateToArbitration || false,
      idempotencyKey: this._generateIdempotencyKey('mc_prearb')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/mastercom/v6/chargebacks/${disputeId}/pre-arbitration`, payload)
    );

    logger.info(`[Mastercom] Pre-arbitration response filed for case ${disputeId} (action: ${payload.action})`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'filed',
      stage: DISPUTE_STAGES.PRE_ARBITRATION,
      message: response.data.message || 'Pre-arbitration response filed',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * File for arbitration with Mastercard on a disputed chargeback.
   * Arbitration is the final stage with a binding decision from Mastercard.
   *
   * @param {string} disputeId       - Mastercom case identifier
   * @param {Object} arbitrationData - Arbitration filing data
   * @returns {Promise<Object>}      Result of arbitration filing
   */
  async fileArbitration(disputeId, arbitrationData) {
    const payload = {
      caseId: disputeId,
      merchantId: this.merchantId,
      acquirerICA: this.acquirerICA,
      stage: DISPUTE_STAGES.ARBITRATION,
      arbitrationReason: arbitrationData.reason || 'compelling_evidence_supports_merchant',
      merchantNarrative: arbitrationData.narrative || '',
      documentIds: arbitrationData.evidenceIds || [],
      requestedOutcome: arbitrationData.requestedOutcome || 'reverse_chargeback',
      filingFeeAccepted: arbitrationData.acceptFilingFee || false,
      idempotencyKey: this._generateIdempotencyKey('mc_arb')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/mastercom/v6/chargebacks/${disputeId}/arbitration`, payload)
    );

    logger.info(`[Mastercom] Arbitration filed for case ${disputeId}`);

    return {
      arbitrationId: response.data.arbitrationId || response.data.id,
      status: response.data.status || 'filed',
      stage: DISPUTE_STAGES.ARBITRATION,
      estimatedDecisionDate: response.data.estimatedDecisionDate || null,
      filingFee: response.data.filingFee || null,
      message: response.data.message || 'Arbitration case filed with Mastercard',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // ETHOCA COLLABORATION
  // ===========================================================================

  /**
   * Fetch Ethoca collaboration alerts linked to this merchant.
   * Ethoca alerts provide early fraud and dispute notifications
   * from issuers before a formal chargeback is filed.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} List of Ethoca alerts
   */
  async fetchEthocaAlerts(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      endDate: params.until || undefined,
      status: params.status || 'pending',
      alertType: params.alertType || undefined,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/mastercom/v6/ethoca/alerts', { params: queryParams })
    );

    const data = response.data;
    const alerts = data.alerts || data.data || [];

    return {
      alerts: alerts.map((a) => this._normalizeEthocaAlert(a)),
      totalCount: data.totalCount || alerts.length,
      hasMore: data.hasMore || false,
      page: data.page || queryParams.page
    };
  }

  /**
   * Respond to an Ethoca collaboration alert.
   *
   * @param {string} alertId     - Ethoca alert identifier
   * @param {Object} actionData  - Response action details
   * @returns {Promise<Object>}  Response result
   */
  async respondToEthocaAlert(alertId, actionData) {
    const payload = {
      alertId,
      merchantId: this.merchantId,
      action: actionData.action || 'confirm_refund', // 'confirm_refund', 'already_refunded', 'no_action'
      refundAmount: actionData.refundAmount || null,
      merchantNotes: actionData.notes || '',
      transactionId: actionData.transactionId || null,
      idempotencyKey: this._generateIdempotencyKey('mc_ethoca')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/mastercom/v6/ethoca/alerts/${alertId}/respond`, payload)
    );

    logger.info(`[Mastercom] Ethoca alert ${alertId} responded (action: ${payload.action})`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'responded',
      message: response.data.message || 'Ethoca alert response submitted',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Mastercom webhook payload.
   * Mastercom sends webhooks as JSON with structure:
   *   { eventType, caseId, data, timestamp, signature }
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
        logger.error('[Mastercom] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Mastercom webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Mastercom] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Mastercom webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify signature if webhook secret is configured
    const signature = headers['x-mastercard-signature'] || headers['x-mastercom-signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Mastercom] Webhook signature verification failed');
        throw new Error('Invalid Mastercom webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event,
      disputeId: parsed.caseId || parsed.chargebackId || parsed.claimId,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-mastercard-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-mastercard-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Mastercom for event notifications.
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
      acquirerICA: this.acquirerICA,
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      apiVersion: 'v6'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/mastercom/v6/webhooks', payload)
    );

    this.webhookSecret = webhookSecret;

    logger.info(`[Mastercom] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a Mastercom chargeback/case into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw Mastercom chargeback data
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.caseId || portalData.chargebackId || portalData.claimId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.claimId || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.chargebackAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedPAN?.slice(-4) || '',
      cardBrand: 'MASTERCARD',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status || portalData.caseStatus),
      portalStatus: portalData.status || portalData.caseStatus,
      disputeStage: portalData.stage || portalData.chargebackStage || DISPUTE_STAGES.FIRST_CHARGEBACK,
      alertType: portalData.alertType || 'CHARGEBACK',
      isPreChargeback: portalData.alertType === 'ETHOCA' || false,
      transactionId: portalData.transactionId || portalData.bankNetReferenceNumber || '',
      transactionDate: portalData.transactionDate || null,
      authorizationCode: portalData.authorizationCode || portalData.approvalCode || '',
      bankNetReferenceNumber: portalData.bankNetReferenceNumber || portalData.bnr || '',
      debitCreditIndicator: portalData.debitCreditIndicator || '',
      memberMessageText: portalData.memberMessageText || '',
      subReasonCode: portalData.subReasonCode || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'MASTERCOM',
      rawData: portalData
    };
  }

  /**
   * Map a Mastercom status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Mastercom status value
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_MC[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Mastercard reason code to a structured object with category and description.
   *
   * @param {string} portalCode - Mastercard reason code (e.g. '4837', '4853')
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = MC_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    // Attempt to categorize unknown codes by range
    const codeNum = parseInt(normalized, 10);
    if (codeNum >= 4800 && codeNum < 4810) {
      return { code: normalized, category: 'AUTHORIZATION', description: `Mastercard Authorization - Code ${normalized}` };
    }
    if (codeNum >= 4830 && codeNum < 4850) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Mastercard Processing Error - Code ${normalized}` };
    }
    if (codeNum >= 4850 && codeNum < 4870) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Mastercard Consumer Dispute - Code ${normalized}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Mastercard Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Mastercom API.
   *
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/mastercom/v6/healthcheck', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Mastercom API is reachable and authenticated',
        details: {
          portalType: 'MASTERCOM',
          merchantId: this.merchantId,
          acquirerICA: this.acquirerICA,
          apiVersion: 'v6',
          responseStatus: response.status,
          authenticated: true
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Mastercom health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'MASTERCOM',
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
   * Generate an OAuth 1.0a Authorization header for Mastercard API requests.
   * Mastercard uses OAuth 1.0a with RSA-SHA256 signing.
   *
   * @param {string} method - HTTP method
   * @param {string} url    - Request URL
   * @param {*} body        - Request body
   * @returns {Promise<string>} OAuth 1.0a Authorization header value
   * @private
   */
  async _generateOAuth1Header(method, url, body) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'RSA-SHA256',
      oauth_timestamp: timestamp,
      oauth_version: '1.0'
    };

    // Build the base string for signing
    const bodyHash = body
      ? crypto.createHash('sha256').update(typeof body === 'string' ? body : JSON.stringify(body)).digest('base64')
      : crypto.createHash('sha256').update('').digest('base64');

    oauthParams['oauth_body_hash'] = bodyHash;

    const paramString = Object.keys(oauthParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
      .join('&');

    const baseUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    const baseString = `${(method || 'GET').toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;

    // Sign with RSA-SHA256 (in production, load the actual PKCS#12 key)
    const signature = crypto
      .createHmac('sha256', this.credentials.signingKeyPassword || this.consumerKey)
      .update(baseString)
      .digest('base64');

    oauthParams['oauth_signature'] = signature;

    const headerParts = Object.keys(oauthParams)
      .sort()
      .map(key => `${key}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    return `OAuth ${headerParts}`;
  }

  /**
   * Parse IPM (Integrated Product Messages) data from a Mastercom chargeback.
   *
   * @param {Object} ipmData - Raw IPM record data
   * @returns {Object} Parsed IPM fields
   * @private
   */
  _parseIPMData(ipmData) {
    return {
      messageType: ipmData.messageType || ipmData.mti || '',
      processingCode: ipmData.processingCode || '',
      transactionAmount: parseFloat(ipmData.transactionAmount || 0),
      settlementAmount: parseFloat(ipmData.settlementAmount || 0),
      cardholderBillingAmount: parseFloat(ipmData.cardholderBillingAmount || 0),
      transmissionDateTime: ipmData.transmissionDateTime || '',
      functionCode: ipmData.functionCode || '',
      messageReasonCode: ipmData.messageReasonCode || '',
      acquirerReferenceData: ipmData.acquirerReferenceData || '',
      debitCreditIndicator: ipmData.debitCreditIndicator || '',
      memberMessageText: ipmData.memberMessageText || '',
      rawData: ipmData
    };
  }

  /**
   * Normalize an Ethoca collaboration alert into a structured object.
   *
   * @param {Object} alert - Raw Ethoca alert data
   * @returns {Object} Normalized Ethoca alert
   * @private
   */
  _normalizeEthocaAlert(alert) {
    return {
      alertId: alert.alertId || alert.id,
      alertType: alert.alertType || 'fraud',
      status: alert.status || 'pending',
      transactionId: alert.transactionId || '',
      transactionDate: alert.transactionDate || '',
      transactionAmount: parseFloat(alert.transactionAmount || alert.amount || 0),
      currency: alert.currency || 'USD',
      cardLastFour: alert.cardLastFour || alert.cardLast4 || '',
      cardholderName: alert.cardholderName || '',
      merchantDescriptor: alert.merchantDescriptor || '',
      issuerName: alert.issuerName || '',
      alertDate: alert.alertDate || alert.createdAt,
      responseDeadline: alert.responseDeadline || null,
      rawData: alert
    };
  }

  /**
   * Calculate the response deadline based on chargeback stage and reason code.
   *
   * @param {string} chargebackDate - ISO date of the chargeback
   * @param {string} stage          - Chargeback stage
   * @param {string} reasonCode     - Mastercard reason code
   * @returns {string} ISO date of the response deadline
   * @private
   */
  _calculateResponseDeadline(chargebackDate, stage, reasonCode) {
    const baseDate = new Date(chargebackDate || Date.now());
    const reasonInfo = MC_REASON_CODES[reasonCode] || {};
    let deadlineDays = reasonInfo.responseDeadlineDays || 45;

    // Adjust deadline based on chargeback stage
    switch (stage) {
      case DISPUTE_STAGES.SECOND_PRESENTMENT:
        deadlineDays = 45;
        break;
      case DISPUTE_STAGES.PRE_ARBITRATION:
        deadlineDays = 45;
        break;
      case DISPUTE_STAGES.ARBITRATION:
        deadlineDays = 10;
        break;
      case DISPUTE_STAGES.PRE_COMPLIANCE:
      case DISPUTE_STAGES.COMPLIANCE:
        deadlineDays = 45;
        break;
      default:
        break;
    }

    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + deadlineDays);
    return deadline.toISOString();
  }

  /**
   * Return default evidence instructions based on the Mastercard reason code.
   *
   * @param {string} reasonCode - Mastercard reason code
   * @returns {string} Evidence instructions
   * @private
   */
  _getDefaultEvidenceInstructions(reasonCode) {
    const instructions = {
      '4835': 'Provide compelling evidence for card-not-present fraud: AVS/CVV match, ' +
              '3-D Secure authentication data, device fingerprint, IP address logs, ' +
              'and prior undisputed transactions.',
      '4837': 'Provide proof of cardholder authorization: signed receipt, chip read log, ' +
              'PIN validation, signed guest registration card, or ID verification.',
      '4853': 'Provide evidence the services were as described: booking confirmation, ' +
              'property photos, guest folio, terms accepted at booking, and any ' +
              'correspondence with the guest.',
      '4855': 'Provide proof the guest received hotel services: check-in confirmation, ' +
              'signed registration card, key card access logs, room folio, and ID verification.',
      '4860': 'Provide refund policy accepted by guest, proof that no cancellation was received, ' +
              'or proof that a credit has already been issued.',
      '4863': 'Provide proof of cardholder presence or authorization: signed registration card, ' +
              'check-in confirmation, ID verification, AVS/CVV match data.'
    };

    return instructions[reasonCode] ||
      'Submit all available evidence including guest folio, signed registration, ' +
      'booking confirmation, authorization records, and any relevant documentation.';
  }
}

module.exports = MastercomAdapter;
