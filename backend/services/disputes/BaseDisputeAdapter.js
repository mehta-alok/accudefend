/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Base Dispute Adapter (Abstract Base Class)
 *
 * Defines the standard interface that all dispute portal adapters must implement.
 * Provides shared utilities for HTTP client setup, request signing, API logging,
 * and retry logic used across Verifi, Ethoca, and Merlink integrations.
 *
 * Adapters handle two-way communication:
 *   Inbound  - receive disputes, alerts, and status updates FROM portals
 *   Outbound - submit evidence, responses, and status updates TO portals
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');

// Default retry configuration
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};

class BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {string} config.portalType   - Portal identifier (VERIFI, ETHOCA, MERLINK)
   * @param {string} config.baseUrl      - API base URL for the portal
   * @param {Object} config.credentials  - Auth credentials (varies per portal)
   * @param {string} config.integrationId - Internal integration record ID
   * @param {Object} [config.retryOptions] - Override default retry settings
   * @param {number} [config.timeoutMs]    - HTTP timeout in milliseconds (default 30000)
   */
  constructor(config) {
    if (new.target === BaseDisputeAdapter) {
      throw new Error('BaseDisputeAdapter is abstract and cannot be instantiated directly');
    }

    this.portalType = config.portalType;
    this.baseUrl = config.baseUrl;
    this.credentials = config.credentials || {};
    this.integrationId = config.integrationId || null;
    this.timeoutMs = config.timeoutMs || 30000;
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...(config.retryOptions || {}) };

    // HTTP client is initialized lazily by subclasses via _initHttpClient
    this.httpClient = null;
  }

  // ===========================================================================
  // INBOUND: Receive data FROM the dispute portal
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from the portal.
   *
   * @param {Object} disputePayload - Raw dispute data from the portal
   * @returns {Promise<Object>} Normalized dispute object:
   *   { disputeId, caseNumber, amount, currency, cardLastFour, guestName,
   *     reasonCode, reasonDescription, disputeDate, dueDate, status, rawData }
   */
  async receiveDispute(disputePayload) {
    throw new Error(`[${this.portalType}] receiveDispute() not implemented`);
  }

  /**
   * Query the portal for the current status of a dispute.
   *
   * @param {string} disputeId - Portal-side dispute identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    throw new Error(`[${this.portalType}] getDisputeStatus() not implemented`);
  }

  /**
   * Retrieve the evidence types and deadline required to respond to a dispute.
   *
   * @param {string} disputeId - Portal-side dispute identifier
   * @returns {Promise<Object>} { requiredTypes: [], deadline, instructions }
   */
  async getEvidenceRequirements(disputeId) {
    throw new Error(`[${this.portalType}] getEvidenceRequirements() not implemented`);
  }

  /**
   * Fetch a paginated list of disputes from the portal.
   *
   * @param {Object} params
   * @param {string} [params.since]  - ISO date string; only disputes after this date
   * @param {string} [params.status] - Filter by portal-side status
   * @param {number} [params.page]   - Page number (1-based)
   * @param {number} [params.limit]  - Results per page
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async fetchDisputes(params) {
    throw new Error(`[${this.portalType}] fetchDisputes() not implemented`);
  }

  // ===========================================================================
  // OUTBOUND: Send data TO the dispute portal
  // ===========================================================================

  /**
   * Submit an evidence package to the portal for a given dispute.
   *
   * @param {string} disputeId - Portal-side dispute identifier
   * @param {Object} evidencePackage
   * @param {Array}  evidencePackage.files - [{ type, fileName, mimeType, data (Buffer) }]
   * @param {Object} evidencePackage.metadata - { guestName, confirmationNumber, ... }
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidencePackage) {
    throw new Error(`[${this.portalType}] submitEvidence() not implemented`);
  }

  /**
   * Push a representment response to the portal.
   *
   * @param {string} disputeId - Portal-side dispute identifier
   * @param {Object} responseData
   * @param {string} responseData.representmentType - Type of representment
   * @param {Object} responseData.compellingEvidence - Evidence details
   * @param {Object} responseData.guestDetails - Guest info
   * @param {Object} responseData.stayDetails - Hotel stay info
   * @param {Array}  responseData.evidenceIds - Array of evidence submission IDs
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    throw new Error(`[${this.portalType}] pushResponse() not implemented`);
  }

  /**
   * Accept liability on a dispute (do not fight it).
   *
   * @param {string} disputeId - Portal-side dispute identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    throw new Error(`[${this.portalType}] acceptDispute() not implemented`);
  }

  /**
   * Update the status of a case on the portal side.
   *
   * @param {string} disputeId - Portal-side dispute identifier
   * @param {string} status    - New status value
   * @param {string} [notes]   - Optional notes about the update
   * @returns {Promise<Object>}
   */
  async updateCaseStatus(disputeId, status, notes) {
    throw new Error(`[${this.portalType}] updateCaseStatus() not implemented`);
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw webhook payload into a structured event object.
   *
   * @param {string|Buffer} rawPayload - Raw request body
   * @param {Object} headers - Request headers
   * @returns {Object} { event, data, timestamp, rawData }
   */
  parseWebhookPayload(rawPayload, headers) {
    throw new Error(`[${this.portalType}] parseWebhookPayload() not implemented`);
  }

  /**
   * Verify the authenticity of a webhook payload using its signature.
   *
   * @param {string|Buffer} rawPayload - Raw request body
   * @param {string} signature - Signature from webhook header
   * @param {string} secret - Shared webhook secret
   * @returns {boolean} true if signature is valid
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    throw new Error(`[${this.portalType}] verifyWebhookSignature() not implemented`);
  }

  /**
   * Register a webhook callback URL with the portal.
   *
   * @param {string} callbackUrl - Our endpoint URL that the portal should POST to
   * @param {string[]} events - Array of event types to subscribe to
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active }
   */
  async registerWebhook(callbackUrl, events) {
    throw new Error(`[${this.portalType}] registerWebhook() not implemented`);
  }

  // ===========================================================================
  // NORMALIZATION (portal-specific -> AccuDefend internal format)
  // ===========================================================================

  /**
   * Convert portal-specific dispute data into AccuDefend normalized format.
   *
   * @param {Object} portalData - Raw dispute data from the portal
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    throw new Error(`[${this.portalType}] normalizeDispute() not implemented`);
  }

  /**
   * Map a portal-specific status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Status value from the portal
   * @returns {string} AccuDefend status (PENDING, IN_REVIEW, SUBMITTED, WON, LOST, EXPIRED)
   */
  normalizeDisputeStatus(portalStatus) {
    throw new Error(`[${this.portalType}] normalizeDisputeStatus() not implemented`);
  }

  /**
   * Map a portal-specific reason code to a human-readable description.
   *
   * @param {string} portalCode - Reason code from the portal
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    throw new Error(`[${this.portalType}] normalizeReasonCode() not implemented`);
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the portal.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    throw new Error(`[${this.portalType}] healthCheck() not implemented`);
  }

  // ===========================================================================
  // SHARED UTILITIES (available to all adapters)
  // ===========================================================================

  /**
   * Initialize an axios HTTP client with base configuration.
   * Subclasses call this during construction and may add interceptors afterward.
   *
   * @param {Object} [headers] - Additional default headers
   * @returns {import('axios').AxiosInstance}
   */
  _initHttpClient(headers = {}) {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AccuDefend/1.0',
        ...headers
      }
    });

    // Response interceptor for logging
    this.httpClient.interceptors.response.use(
      (response) => {
        const duration = response.config._startTime
          ? Date.now() - response.config._startTime
          : 0;
        this._logApiCall(
          response.config.method?.toUpperCase(),
          response.config.url,
          response.status,
          duration
        );
        return response;
      },
      (error) => {
        const config = error.config || {};
        const duration = config._startTime ? Date.now() - config._startTime : 0;
        this._logApiError(
          config.method?.toUpperCase() || 'UNKNOWN',
          config.url || 'unknown',
          error,
          duration
        );
        return Promise.reject(error);
      }
    );

    // Request interceptor to record start time
    this.httpClient.interceptors.request.use((config) => {
      config._startTime = Date.now();
      return config;
    });

    return this.httpClient;
  }

  /**
   * Execute an HTTP request with automatic retry on transient failures.
   *
   * @param {Function} requestFn - Async function that returns an axios response
   * @param {Object} [options] - Override retry options for this call
   * @returns {Promise<Object>} Axios response
   */
  async _withRetry(requestFn, options = {}) {
    const opts = { ...this.retryOptions, ...options };
    let lastError;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        const status = error.response?.status;

        // Do not retry client errors (4xx) except for rate limits and timeouts
        if (status && !opts.retryableStatuses.includes(status)) {
          throw error;
        }

        if (attempt < opts.maxRetries) {
          const delay = Math.min(
            opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500,
            opts.maxDelayMs
          );
          logger.warn(
            `[Dispute:${this.portalType}] Request failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), ` +
            `retrying in ${Math.round(delay)}ms: ${error.message}`
          );
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Log a successful API call.
   *
   * @param {string} method - HTTP method
   * @param {string} endpoint - Request URL/path
   * @param {number} status - HTTP response status
   * @param {number} durationMs - Request duration in ms
   */
  _logApiCall(method, endpoint, status, durationMs) {
    logger.info(`[Dispute:${this.portalType}] ${method} ${endpoint} -> ${status} (${durationMs}ms)`);
  }

  /**
   * Log a failed API call.
   *
   * @param {string} method - HTTP method
   * @param {string} endpoint - Request URL/path
   * @param {Error} error - The error that occurred
   * @param {number} [durationMs] - Request duration in ms
   */
  _logApiError(method, endpoint, error, durationMs) {
    logger.error(`[Dispute:${this.portalType}] ${method} ${endpoint} FAILED (${durationMs || 0}ms):`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }

  /**
   * Generate an HMAC-SHA256 signature for a payload.
   *
   * @param {*} payload - Data to sign (will be JSON.stringified)
   * @param {string} secret - Signing secret
   * @returns {string} Hex-encoded signature
   */
  _generateSignature(payload, secret) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify an HMAC-SHA256 signature using timing-safe comparison.
   *
   * @param {*} payload - Original data that was signed
   * @param {string} signature - Signature to verify
   * @param {string} secret - Signing secret
   * @returns {boolean}
   */
  _verifySignature(payload, signature, secret) {
    const expected = this._generateSignature(payload, secret);
    if (expected.length !== signature.length) {
      return false;
    }
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique idempotency key for outbound requests.
   *
   * @param {string} prefix - Key prefix (e.g. 'evidence', 'response')
   * @returns {string}
   */
  _generateIdempotencyKey(prefix) {
    return `${prefix}_${this.portalType}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Promise-based sleep utility.
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Safely extract an error message from an axios error response.
   *
   * @param {Error} error - Axios error
   * @returns {string} Human-readable error message
   */
  _extractErrorMessage(error) {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.error) {
      return typeof error.response.data.error === 'string'
        ? error.response.data.error
        : JSON.stringify(error.response.data.error);
    }
    return error.message || 'Unknown error';
  }
}

module.exports = BaseDisputeAdapter;
