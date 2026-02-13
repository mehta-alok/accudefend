/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Signifyd Commerce Protection Adapter
 *
 * Implements two-way integration with Signifyd's commerce protection platform:
 *   - Guaranteed Fraud Protection: Signifyd provides a financial guarantee on
 *     approved transactions. If a guaranteed order results in a chargeback,
 *     Signifyd covers the chargeback cost. This shifts fraud liability from
 *     the merchant to Signifyd.
 *   - Chargeback Recovery: Full dispute management for non-guaranteed
 *     chargebacks with evidence submission and representment workflows.
 *   - Case Management: Real-time fraud decisions on orders using machine
 *     learning, linking analysis, and a global merchant network.
 *   - Abuse Prevention: Identifies policy abuse (return abuse, promo abuse,
 *     account takeover) distinct from traditional payment fraud.
 *   - Payment Optimization: Reduces false declines by identifying legitimate
 *     orders that might otherwise be declined.
 *
 * Auth: API Key sent as Basic Auth (base64 encoded, no password).
 * Base URL: https://api.signifyd.com/api/v3 (configurable)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// SIGNIFYD REASON CODE MAPPINGS
// =============================================================================

const SIGNIFYD_REASON_CODES = {
  'FRAUD': {
    code: 'FRAUD',
    category: 'FRAUD',
    description: 'Fraudulent transaction',
    compellingEvidenceTypes: ['device_fingerprint', 'ip_address_match', 'avs_cvv_match', 'prior_undisputed_transactions']
  },
  'ITEM_NOT_RECEIVED': {
    code: 'ITEM_NOT_RECEIVED',
    category: 'CONSUMER_DISPUTE',
    description: 'Item or service not received by cardholder',
    compellingEvidenceTypes: ['check_in_confirmation', 'folio', 'guest_registration_card', 'key_card_logs']
  },
  'ITEM_NOT_AS_DESCRIBED': {
    code: 'ITEM_NOT_AS_DESCRIBED',
    category: 'CONSUMER_DISPUTE',
    description: 'Item or service not as described',
    compellingEvidenceTypes: ['service_description', 'terms_accepted', 'guest_correspondence', 'quality_documentation']
  },
  'UNAUTHORIZED': {
    code: 'UNAUTHORIZED',
    category: 'FRAUD',
    description: 'Unauthorized transaction by cardholder',
    compellingEvidenceTypes: ['avs_cvv_match', 'device_fingerprint', '3ds_authentication', 'ip_address_match']
  },
  'DUPLICATE': {
    code: 'DUPLICATE',
    category: 'PROCESSING_ERROR',
    description: 'Duplicate charge for same transaction',
    compellingEvidenceTypes: ['transaction_records', 'folio', 'itemized_charges']
  },
  'SUBSCRIPTION_CANCELLED': {
    code: 'SUBSCRIPTION_CANCELLED',
    category: 'CONSUMER_DISPUTE',
    description: 'Recurring charge after subscription cancellation',
    compellingEvidenceTypes: ['terms_and_conditions', 'cancellation_policy', 'signed_agreement']
  },
  'CREDIT_NOT_PROCESSED': {
    code: 'CREDIT_NOT_PROCESSED',
    category: 'CONSUMER_DISPUTE',
    description: 'Expected credit or refund not processed',
    compellingEvidenceTypes: ['refund_policy', 'terms_and_conditions', 'credit_issued_proof']
  },
  'GENERAL': {
    code: 'GENERAL',
    category: 'CONSUMER_DISPUTE',
    description: 'General consumer dispute',
    compellingEvidenceTypes: ['folio', 'booking_confirmation', 'guest_correspondence', 'terms_accepted']
  },
  'CANCELLED_MERCHANDISE': {
    code: 'CANCELLED_MERCHANDISE',
    category: 'CONSUMER_DISPUTE',
    description: 'Cancelled service or merchandise',
    compellingEvidenceTypes: ['cancellation_policy', 'no_show_documentation', 'reservation_confirmation']
  },
  'PRODUCT_UNACCEPTABLE': {
    code: 'PRODUCT_UNACCEPTABLE',
    category: 'CONSUMER_DISPUTE',
    description: 'Product or service quality unacceptable',
    compellingEvidenceTypes: ['service_description', 'quality_documentation', 'guest_correspondence']
  }
};

// Signifyd portal status -> AccuDefend internal status
const STATUS_MAP_FROM_SIGNIFYD = {
  'open': 'PENDING',
  'new': 'PENDING',
  'investigating': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'needs_response': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'won': 'WON',
  'chargeback_reversed': 'WON',
  'lost': 'LOST',
  'chargeback_upheld': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'resolved': 'RESOLVED',
  'guaranteed_covered': 'RESOLVED'
};

// AccuDefend status -> Signifyd portal status
const STATUS_MAP_TO_SIGNIFYD = {
  'PENDING': 'open',
  'IN_REVIEW': 'investigating',
  'SUBMITTED': 'submitted',
  'WON': 'won',
  'LOST': 'lost',
  'EXPIRED': 'expired'
};

// Signifyd case decision types
const DECISION_TYPES = {
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
  HOLD: 'HOLD',
  REVIEW: 'REVIEW'
};

// Guarantee statuses
const GUARANTEE_STATUSES = {
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  CANCELLED: 'CANCELLED'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'case.created',
  'case.updated',
  'case.decision',
  'guarantee.created',
  'guarantee.updated',
  'chargeback.created',
  'chargeback.updated',
  'chargeback.resolved',
  'evidence.requested',
  'claim.created',
  'claim.resolved'
];


class SignifydAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey         - Signifyd API Key
   * @param {string} [config.credentials.teamId]       - Signifyd Team ID
   * @param {string} [config.credentials.webhookSecret] - Shared webhook secret
   * @param {boolean} [config.credentials.guaranteeEnabled] - Financial guarantee active
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'SIGNIFYD',
      baseUrl: config.baseUrl || process.env.SIGNIFYD_API_URL || 'https://api.signifyd.com/api/v3'
    });

    this.teamId = this.credentials.teamId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.guaranteeEnabled = this.credentials.guaranteeEnabled || false;

    // Signifyd uses Basic Auth with API key as username and empty password
    const basicAuth = Buffer.from(`${this.credentials.apiKey}:`).toString('base64');
    this._initHttpClient({
      'Authorization': `Basic ${basicAuth}`,
      'X-Signifyd-Team-ID': this.teamId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with the Signifyd API and verify credentials.
   * Signifyd uses Basic Auth with the API key as username (no password).
   *
   * @returns {Promise<Object>} { authenticated, teamId, features, guaranteeStatus }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/auth/verify')
      );

      const data = response.data;
      logger.info(`[Signifyd] Authentication successful for team ${this.teamId}`);

      return {
        authenticated: true,
        teamId: data.teamId || this.teamId,
        teamName: data.teamName || '',
        features: data.features || [],
        guaranteeEnabled: data.guaranteeEnabled || this.guaranteeEnabled,
        guaranteeBalance: data.guaranteeBalance || null,
        expiresAt: data.tokenExpiry || null
      };
    } catch (error) {
      logger.error(`[Signifyd] Authentication failed: ${this._extractErrorMessage(error)}`);
      return {
        authenticated: false,
        teamId: this.teamId,
        error: this._extractErrorMessage(error)
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Signifyd
  // ===========================================================================

  /**
   * Receive and normalize a chargeback/case payload from Signifyd.
   * Checks guarantee status to determine if Signifyd covers the chargeback.
   *
   * @param {Object} disputeData - Raw chargeback/case data from Signifyd
   * @returns {Promise<Object>} Normalized dispute object in AccuDefend format
   */
  async receiveDispute(disputeData) {
    logger.info(`[Signifyd] Receiving dispute: ${disputeData.chargebackId || disputeData.caseId || disputeData.id}`);

    // Check guarantee status if this chargeback is linked to a guaranteed case
    if (this.guaranteeEnabled && disputeData.caseId && !disputeData.guaranteeStatus) {
      try {
        const guarantee = await this.getGuaranteeStatus(disputeData.caseId);
        disputeData._guaranteeEnriched = true;
        disputeData.guaranteeStatus = guarantee.status;
        disputeData.guaranteeCovered = guarantee.covered;
      } catch (err) {
        logger.warn(`[Signifyd] Could not enrich with guarantee status: ${err.message}`);
      }
    }

    const normalized = this.normalizeDispute(disputeData);
    logger.info(
      `[Signifyd] Dispute normalized: ${normalized.disputeId} ` +
      `(Guarantee: ${disputeData.guaranteeStatus || 'N/A'})`
    );
    return normalized;
  }

  /**
   * Query Signifyd for the current status of a chargeback.
   *
   * @param {string} disputeId - Signifyd chargeback identifier
   * @returns {Promise<Object>} Chargeback status with guarantee info
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/chargebacks/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.updatedAt || data.lastModified,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      guaranteeStatus: data.guaranteeStatus || null,
      guaranteeCovered: data.guaranteeCovered || false,
      caseId: data.caseId || null,
      caseDecision: data.caseDecision || null
    };
  }

  /**
   * Fetch a paginated list of chargebacks from Signifyd.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore, page }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || undefined,
      guaranteeStatus: params.guaranteeStatus || undefined,
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100),
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc'
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/chargebacks', { params: queryParams })
    );

    const data = response.data;
    const chargebacks = data.chargebacks || data.data || [];

    return {
      disputes: chargebacks.map(cb => this.normalizeDispute(cb)),
      totalCount: data.totalCount || data.total || chargebacks.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // OUTBOUND: Send TO Signifyd
  // ===========================================================================

  /**
   * Submit evidence to Signifyd for a chargeback dispute.
   *
   * @param {string} disputeId - Signifyd chargeback identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message, timestamp }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      chargebackId: disputeId,
      teamId: this.teamId,
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
        orderId: metadata.orderId
      },
      caseContext: {
        caseId: metadata.caseId || null,
        decision: metadata.caseDecision || null,
        guaranteeStatus: metadata.guaranteeStatus || null
      },
      merchantNarrative: metadata.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/evidence`, payload)
    );

    logger.info(`[Signifyd] Evidence submitted for chargeback ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Signifyd for a chargeback.
   *
   * @param {string} disputeId - Signifyd chargeback identifier
   * @param {Object} responseData - Response with evidence and details
   * @returns {Promise<Object>} { responseId, status, message, timestamp }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      chargebackId: disputeId,
      teamId: this.teamId,
      responseType: responseData.representmentType || 'representment',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceInfo: responseData.compellingEvidence?.deviceInfo || null,
        linkingData: responseData.compellingEvidence?.linkingData || null
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
      this.httpClient.post(`/chargebacks/${disputeId}/respond`, payload)
    );

    logger.info(`[Signifyd] Response submitted for chargeback ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a chargeback (do not fight it).
   *
   * @param {string} disputeId - Signifyd chargeback identifier
   * @returns {Promise<Object>} { accepted, disputeId, responseId, message }
   */
  async acceptDispute(disputeId) {
    const payload = {
      chargebackId: disputeId,
      teamId: this.teamId,
      action: 'accept_liability',
      reason: 'Merchant accepts liability',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/respond`, payload)
    );

    logger.info(`[Signifyd] Chargeback ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Chargeback accepted'
    };
  }

  // ===========================================================================
  // CASE MANAGEMENT AND DECISIONS
  // ===========================================================================

  /**
   * Retrieve a Signifyd case and its fraud decision.
   * Cases are created when an order is submitted for fraud screening.
   *
   * @param {string} caseId - Signifyd case identifier
   * @returns {Promise<Object>} Case details with decision and score
   */
  async getCase(caseId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/cases/${caseId}`)
    );

    const data = response.data;

    return {
      caseId: data.caseId || data.id || caseId,
      orderId: data.orderId || null,
      decision: data.decision || null,
      score: data.score || 0,
      guaranteeEligible: data.guaranteeEligible || false,
      guaranteeStatus: data.guaranteeStatus || null,
      riskFactors: data.riskFactors || [],
      linkingAnalysis: data.linkingAnalysis || null,
      deviceInfo: data.deviceInfo || null,
      abuseIndicators: data.abuseIndicators || [],
      status: data.status || 'open',
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    };
  }

  /**
   * Get the fraud decision for a specific case.
   *
   * @param {string} caseId - Signifyd case identifier
   * @returns {Promise<Object>} Decision details
   */
  async getCaseDecision(caseId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/cases/${caseId}/decisions`)
    );

    const data = response.data;

    return {
      caseId,
      decision: data.decision || data.checkpointAction || null,
      score: data.score || 0,
      reasons: data.reasons || [],
      guaranteeDisposition: data.guaranteeDisposition || null,
      abuseDecision: data.abuseDecision || null,
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // GUARANTEE MANAGEMENT
  // ===========================================================================

  /**
   * Get the financial guarantee status for a case/order.
   * When a guarantee is APPROVED, Signifyd covers chargeback costs.
   *
   * @param {string} caseId - Signifyd case identifier
   * @returns {Promise<Object>} Guarantee status and coverage details
   */
  async getGuaranteeStatus(caseId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/guarantees`, {
        params: { caseId }
      })
    );

    const data = response.data;

    return {
      caseId,
      guaranteeId: data.guaranteeId || data.id || null,
      status: data.status || data.disposition || 'UNKNOWN',
      covered: data.status === 'APPROVED' || data.disposition === 'APPROVED',
      coverageAmount: data.coverageAmount || null,
      claimStatus: data.claimStatus || null,
      claimAmount: data.claimAmount || null,
      expiresAt: data.expiresAt || null,
      createdAt: data.createdAt || null
    };
  }

  /**
   * Submit a guarantee claim for a chargeback on a guaranteed order.
   * This initiates the reimbursement process from Signifyd.
   *
   * @param {Object} claimData
   * @param {string} claimData.caseId - Signifyd case identifier
   * @param {string} claimData.chargebackId - Chargeback identifier
   * @param {number} claimData.amount - Chargeback amount to claim
   * @param {string} claimData.reasonCode - Chargeback reason code
   * @returns {Promise<Object>} Claim submission result
   */
  async submitGuaranteeClaim(claimData) {
    const payload = {
      caseId: claimData.caseId,
      chargebackId: claimData.chargebackId,
      amount: claimData.amount,
      currency: claimData.currency || 'USD',
      reasonCode: claimData.reasonCode,
      chargebackDate: claimData.chargebackDate || new Date().toISOString(),
      supportingDocuments: claimData.documents || [],
      idempotencyKey: this._generateIdempotencyKey('claim')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/guarantees/claims', payload)
    );

    logger.info(`[Signifyd] Guarantee claim submitted for case ${claimData.caseId}`);

    return {
      claimId: response.data.claimId || response.data.id,
      status: response.data.status || 'submitted',
      estimatedPayout: response.data.estimatedPayout || claimData.amount,
      message: response.data.message || 'Guarantee claim submitted',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // ANALYTICS AND WIN RATE TRACKING
  // ===========================================================================

  /**
   * Fetch analytics from Signifyd including guarantee utilization,
   * chargeback recovery rates, and case decision metrics.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date (ISO format)
   * @param {string} params.endDate - End date (ISO format)
   * @param {string} [params.groupBy] - 'day', 'week', or 'month'
   * @returns {Promise<Object>} Analytics data
   */
  async getAnalytics(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          groupBy: params.groupBy || 'month',
          teamId: this.teamId
        }
      })
    );

    const data = response.data;

    return {
      summary: {
        totalChargebacks: data.totalChargebacks || 0,
        totalRecovered: data.totalRecovered || 0,
        totalGuaranteeClaimed: data.totalGuaranteeClaimed || 0,
        totalGuaranteePaid: data.totalGuaranteePaid || 0,
        winRate: data.winRate || 0,
        guaranteeCoverageRate: data.guaranteeCoverageRate || 0,
        avgDecisionScore: data.avgDecisionScore || 0,
        falseDeclineRate: data.falseDeclineRate || 0
      },
      caseDecisionBreakdown: data.caseDecisionBreakdown || [],
      reasonCodeBreakdown: data.reasonCodeBreakdown || [],
      monthlyTrend: data.monthlyTrend || [],
      guaranteeMetrics: {
        totalGuaranteed: data.guaranteeMetrics?.totalGuaranteed || 0,
        totalClaims: data.guaranteeMetrics?.totalClaims || 0,
        claimApprovalRate: data.guaranteeMetrics?.claimApprovalRate || 0,
        avgClaimResolutionDays: data.guaranteeMetrics?.avgClaimResolutionDays || 0
      },
      abuseMetrics: data.abuseMetrics || null,
      period: { startDate: params.startDate, endDate: params.endDate }
    };
  }

  /**
   * Get win rate statistics segmented by guarantee status.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date
   * @param {string} params.endDate - End date
   * @returns {Promise<Object>} Win rates by guarantee status
   */
  async getWinRatesByGuaranteeStatus(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics/win-rates', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          teamId: this.teamId,
          groupBy: 'guaranteeStatus'
        }
      })
    );

    return {
      winRates: response.data.winRates || response.data.data || [],
      overallWinRate: response.data.overallWinRate || 0,
      period: { startDate: params.startDate, endDate: params.endDate }
    };
  }

  // ===========================================================================
  // AUTO-REPRESENTMENT TEMPLATES
  // ===========================================================================

  /**
   * Generate an auto-representment template leveraging Signifyd's case
   * data, linking analysis, and network intelligence.
   *
   * @param {string} disputeId - Signifyd chargeback identifier
   * @param {Object} [context] - Additional context
   * @returns {Promise<Object>} Template with evidence checklist and win probability
   */
  async generateRepresentmentTemplate(disputeId, context = {}) {
    const payload = {
      chargebackId: disputeId,
      teamId: this.teamId,
      additionalContext: {
        guestName: context.guestName || null,
        confirmationNumber: context.confirmationNumber || null,
        stayDetails: context.stayDetails || null,
        availableEvidence: context.availableEvidence || [],
        caseId: context.caseId || null,
        includeCaseData: context.includeCaseData !== false
      }
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/auto-template`, payload)
    );

    const data = response.data;

    return {
      template: data.template || null,
      requiredFields: data.requiredFields || [],
      optionalFields: data.optionalFields || [],
      winProbability: data.winProbability || 0,
      narrative: data.narrative || '',
      evidenceChecklist: data.evidenceChecklist || [],
      caseDataIncluded: data.caseDataIncluded || false,
      guaranteeContext: data.guaranteeContext || null,
      linkingEvidence: data.linkingEvidence || null,
      reasonCodeGuidance: data.reasonCodeGuidance || ''
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Signifyd webhook payload into a structured event object.
   * Signifyd signs webhooks using SHA256 HMAC with the team's webhook secret.
   *
   * @param {Object} headers - Request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} { event, data, timestamp, webhookId, rawData }
   */
  parseWebhookPayload(headers, body) {
    let parsed;

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[Signifyd] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Signifyd webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Signifyd] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Signifyd webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature if secret is configured
    const signature = headers['x-signifyd-sec-hmac-sha256'] || headers['x-signifyd-signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Signifyd] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.event || parsed.eventType || headers['x-signifyd-topic'],
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-signifyd-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-signifyd-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Signifyd.
   *
   * @param {Object} config
   * @param {string} config.callbackUrl - Endpoint URL for Signifyd to POST to
   * @param {string[]} [config.events] - Event types to subscribe to
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      teamId: this.teamId,
      url: config.callbackUrl,
      eventType: events,
      active: true,
      secret: webhookSecret
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[Signifyd] Webhook registered: ${config.callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: response.data.webhookId || response.data.id,
      callbackUrl: config.callbackUrl,
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
   * Normalize a Signifyd chargeback into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw chargeback data from Signifyd
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.chargebackId || portalData.caseId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || portalData.chargebackAmount || 0);
    const reasonCode = portalData.reasonCode || portalData.chargebackReason || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || '',
      cardBrand: portalData.cardBrand || portalData.cardNetwork || 'UNKNOWN',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      caseId: portalData.caseId || null,
      caseDecision: portalData.caseDecision || portalData.decision || null,
      caseScore: portalData.caseScore || portalData.score || null,
      guaranteeStatus: portalData.guaranteeStatus || null,
      guaranteeCovered: portalData.guaranteeCovered || false,
      transactionId: portalData.transactionId || portalData.orderId || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'SIGNIFYD',
      rawData: portalData
    };
  }

  /**
   * Map a Signifyd status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Status value from Signifyd
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_SIGNIFYD[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Signifyd reason code to a structured object.
   *
   * @param {string} portalCode - Reason code from Signifyd
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase().replace(/\s+/g, '_');
    const known = SIGNIFYD_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    const upper = normalized.toUpperCase();
    if (upper.includes('FRAUD') || upper.includes('UNAUTHORIZED')) {
      return { code: normalized, category: 'FRAUD', description: `Fraud - ${portalCode}` };
    }
    if (upper.includes('ITEM') || upper.includes('SERVICE') || upper.includes('CANCEL') || upper.includes('CREDIT')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Consumer Dispute - ${portalCode}` };
    }
    if (upper.includes('DUPLICATE') || upper.includes('PROCESSING')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Processing Error - ${portalCode}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Signifyd Code: ${portalCode}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Signifyd API.
   *
   * @returns {Promise<Object>} { healthy, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Signifyd API is reachable',
        details: {
          portalType: 'SIGNIFYD',
          teamId: this.teamId,
          guaranteeEnabled: this.guaranteeEnabled,
          apiVersion: 'v3',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Signifyd API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'SIGNIFYD',
          teamId: this.teamId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = SignifydAdapter;
