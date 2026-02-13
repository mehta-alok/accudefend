/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Dispute Adapter Factory
 *
 * Factory module for creating dispute portal adapter instances.
 *
 * Supported portal types:
 *   - VERIFI  (Visa CDRN, RDR, Order Insight)
 *   - ETHOCA  (Mastercard Alerts, Consumer Clarity, Eliminator)
 *   - MERLINK (Hospitality dispute management, full 2-way sync)
 *
 * Unsupported portal types return null, indicating that those integrations
 * use the generic webhook handling path in DisputeCompanyService rather than
 * a dedicated adapter.
 *
 * Usage:
 *   const { createDisputeAdapter } = require('./disputes/DisputeAdapterFactory');
 *
 *   const adapter = createDisputeAdapter('VERIFI', {
 *     credentials: { apiKey: '...', merchantId: '...', cardAcceptorId: '...' },
 *     baseUrl: 'https://api.verifi.com/v3',
 *     integrationId: 'int_abc123'
 *   });
 *
 *   if (adapter) {
 *     const health = await adapter.healthCheck();
 *     const disputes = await adapter.fetchDisputes({ status: 'pending' });
 *   }
 */

const VerifiAdapter = require('./VerifiAdapter');
const EthocaAdapter = require('./EthocaAdapter');
const MerlinkAdapter = require('./MerlinkAdapter');

// Registry of supported adapter classes keyed by portal type
const ADAPTERS = {
  VERIFI: VerifiAdapter,
  ETHOCA: EthocaAdapter,
  MERLINK: MerlinkAdapter,
};

/**
 * Create a dispute adapter instance for the given portal type.
 *
 * @param {string} portalType - Portal identifier (case-insensitive): VERIFI, ETHOCA, or MERLINK
 * @param {Object} config - Adapter configuration
 * @param {Object} config.credentials - Portal-specific authentication credentials
 * @param {string} [config.baseUrl] - Override the default portal API base URL
 * @param {string} [config.integrationId] - Internal integration record ID
 * @param {number} [config.timeoutMs] - HTTP request timeout in milliseconds
 * @param {Object} [config.retryOptions] - Retry settings override
 * @returns {BaseDisputeAdapter|null} Adapter instance, or null if the portal type is unsupported
 */
function createDisputeAdapter(portalType, config) {
  const AdapterClass = ADAPTERS[portalType?.toUpperCase()];

  if (!AdapterClass) {
    // Null return signals that this portal type does not have a dedicated adapter.
    // The caller should fall back to generic webhook handling.
    return null;
  }

  return new AdapterClass({ ...config, portalType: portalType.toUpperCase() });
}

/**
 * Get the list of portal types that have dedicated adapter implementations.
 *
 * @returns {string[]} Array of supported portal type strings (e.g. ['VERIFI', 'ETHOCA', 'MERLINK'])
 */
function getSupportedTypes() {
  return Object.keys(ADAPTERS);
}

/**
 * Check whether a given portal type has a dedicated adapter implementation.
 *
 * @param {string} portalType - Portal identifier (case-insensitive)
 * @returns {boolean} true if the portal type is supported
 */
function isSupported(portalType) {
  return !!ADAPTERS[portalType?.toUpperCase()];
}

module.exports = { createDisputeAdapter, getSupportedTypes, isSupported };
