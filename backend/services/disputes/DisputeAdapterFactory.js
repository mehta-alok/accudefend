/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Dispute Adapter Factory
 *
 * Factory module for creating dispute portal adapter instances.
 * Supports 20+ dispute portals across card networks, merchant processors,
 * and third-party chargeback management platforms.
 *
 * Usage:
 *   const { createDisputeAdapter } = require('./disputes/DisputeAdapterFactory');
 *
 *   const adapter = createDisputeAdapter('VISA_VROL', {
 *     credentials: { clientId: '...', clientSecret: '...' },
 *     baseUrl: 'https://api.visa.com',
 *     integrationId: 'int_abc123'
 *   });
 *
 *   if (adapter) {
 *     const health = await adapter.healthCheck();
 *     const disputes = await adapter.listDisputes({ status: 'pending' });
 *   }
 */

'use strict';

// ─── Original / Core Adapters ───────────────────────────────────────────────
const VerifiAdapter     = require('./VerifiAdapter');
const EthocaAdapter     = require('./EthocaAdapter');
const MerlinkAdapter    = require('./MerlinkAdapter');

// ─── Card Network Dispute Platforms ─────────────────────────────────────────
const VisaVROLAdapter       = require('./VisaVROLAdapter');
const MastercomAdapter      = require('./MastercomAdapter');
const AmexMerchantAdapter   = require('./AmexMerchantAdapter');
const DiscoverDisputeAdapter = require('./DiscoverDisputeAdapter');

// ─── Direct Merchant Processor Portals ──────────────────────────────────────
const ElavonAdapter          = require('./ElavonAdapter');
const FiservAdapter          = require('./FiservAdapter');
const WorldpayAdapter        = require('./WorldpayAdapter');
const ChaseMerchantAdapter   = require('./ChaseMerchantAdapter');
const GlobalPaymentsAdapter  = require('./GlobalPaymentsAdapter');
const TSYSAdapter            = require('./TSYSAdapter');
const SquareAdapter          = require('./SquareAdapter');
const StripeDisputeAdapter   = require('./StripeDisputeAdapter');
const AuthorizeNetAdapter    = require('./AuthorizeNetAdapter');

// ─── Third-Party Chargeback Management Platforms ────────────────────────────
const Chargebacks911Adapter  = require('./Chargebacks911Adapter');
const KountAdapter           = require('./KountAdapter');
const MidigatorAdapter       = require('./MidigatorAdapter');
const SignifydAdapter        = require('./SignifydAdapter');
const RiskifiedAdapter       = require('./RiskifiedAdapter');

/**
 * Registry of supported adapter classes keyed by portal type.
 * Keys are uppercase for case-insensitive lookups.
 */
const ADAPTERS = {
  // Core / Prevention
  VERIFI:   VerifiAdapter,
  ETHOCA:   EthocaAdapter,
  MERLINK:  MerlinkAdapter,

  // Card Networks
  VISA_VROL:        VisaVROLAdapter,
  MASTERCOM:        MastercomAdapter,
  AMEX_MERCHANT:    AmexMerchantAdapter,
  DISCOVER_DISPUTE: DiscoverDisputeAdapter,

  // Merchant Processors
  ELAVON:           ElavonAdapter,
  FISERV:           FiservAdapter,
  WORLDPAY:         WorldpayAdapter,
  CHASE_MERCHANT:   ChaseMerchantAdapter,
  GLOBAL_PAYMENTS:  GlobalPaymentsAdapter,
  TSYS:             TSYSAdapter,
  SQUARE:           SquareAdapter,
  STRIPE:           StripeDisputeAdapter,
  AUTHORIZE_NET:    AuthorizeNetAdapter,

  // Third-Party Chargeback Management
  CHARGEBACKS911:   Chargebacks911Adapter,
  KOUNT:            KountAdapter,
  MIDIGATOR:        MidigatorAdapter,
  SIGNIFYD:         SignifydAdapter,
  RISKIFIED:        RiskifiedAdapter,
};

/**
 * Metadata about each supported dispute portal.
 */
const PORTAL_METADATA = {
  // ── Core / Prevention ──────────────────────────────────────────────────────
  VERIFI: {
    displayName: 'Verifi (Visa CDRN)',
    category: 'prevention',
    authType: 'api_key',
    cardNetworks: ['visa'],
    twoWaySync: true,
    features: ['cdrn_alerts', 'rdr_resolution', 'order_insight', 'evidence_submission'],
  },
  ETHOCA: {
    displayName: 'Ethoca (Mastercard)',
    category: 'prevention',
    authType: 'api_key',
    cardNetworks: ['mastercard'],
    twoWaySync: true,
    features: ['alerts', 'consumer_clarity', 'eliminator', 'evidence_submission'],
  },
  MERLINK: {
    displayName: 'Merlink',
    category: 'prevention',
    authType: 'api_key',
    cardNetworks: ['all'],
    twoWaySync: true,
    features: ['hospitality_disputes', 'evidence_management', 'case_tracking', 'analytics'],
  },

  // ── Card Networks ──────────────────────────────────────────────────────────
  VISA_VROL: {
    displayName: 'Visa Resolve Online (VROL)',
    category: 'card_network',
    authType: 'oauth2',
    cardNetworks: ['visa'],
    twoWaySync: true,
    features: ['disputes', 'pre_arbitration', 'arbitration', 'compliance', 'tc40_reports', 'ce3_evidence'],
  },
  MASTERCOM: {
    displayName: 'Mastercard Mastercom',
    category: 'card_network',
    authType: 'oauth2',
    cardNetworks: ['mastercard'],
    twoWaySync: true,
    features: ['chargebacks', 'second_presentment', 'arbitration', 'pre_arbitration', 'collaboration'],
  },
  AMEX_MERCHANT: {
    displayName: 'American Express Merchant Portal',
    category: 'card_network',
    authType: 'api_key',
    cardNetworks: ['amex'],
    twoWaySync: true,
    features: ['chargebacks', 'inquiries', 'adjustments', 'safekey_data', 'evidence_submission'],
  },
  DISCOVER_DISPUTE: {
    displayName: 'Discover Dispute Management',
    category: 'card_network',
    authType: 'api_key',
    cardNetworks: ['discover'],
    twoWaySync: true,
    features: ['retrievals', 'chargebacks', 'pre_arbitration', 'evidence_submission'],
  },

  // ── Merchant Processors ────────────────────────────────────────────────────
  ELAVON: {
    displayName: 'Elavon',
    category: 'processor',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['disputes', 'evidence_submission', 'representment', 'converge_gateway'],
  },
  FISERV: {
    displayName: 'Fiserv (First Data)',
    category: 'processor',
    authType: 'oauth2',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['disputes', 'evidence_submission', 'representment', 'clientline', 'clover'],
  },
  WORLDPAY: {
    displayName: 'Worldpay (FIS)',
    category: 'processor',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['disputes', 'evidence_submission', 'representment'],
  },
  CHASE_MERCHANT: {
    displayName: 'Chase Merchant Services',
    category: 'processor',
    authType: 'oauth2',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['chargebacks', 'evidence_submission', 'representment'],
  },
  GLOBAL_PAYMENTS: {
    displayName: 'Global Payments',
    category: 'processor',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['disputes', 'evidence_submission', 'representment', 'gp_api'],
  },
  TSYS: {
    displayName: 'TSYS',
    category: 'processor',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['chargebacks', 'evidence_submission', 'representment'],
  },
  SQUARE: {
    displayName: 'Square',
    category: 'processor',
    authType: 'oauth2',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['disputes', 'evidence_submission', 'accept_dispute'],
  },
  STRIPE: {
    displayName: 'Stripe',
    category: 'processor',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['disputes', 'evidence_submission', 'close_dispute', 'file_uploads'],
  },
  AUTHORIZE_NET: {
    displayName: 'Authorize.net',
    category: 'processor',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['chargebacks', 'evidence_submission', 'representment'],
  },

  // ── Third-Party Chargeback Management ──────────────────────────────────────
  CHARGEBACKS911: {
    displayName: 'Chargebacks911',
    category: 'third_party',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['alerts', 'representment', 'source_detection', 'analytics', 'roi_tracking', 'auto_respond'],
  },
  KOUNT: {
    displayName: 'Kount (Equifax)',
    category: 'third_party',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['disputes', 'risk_scoring', 'device_fingerprinting', 'identity_trust', 'prevention'],
  },
  MIDIGATOR: {
    displayName: 'Midigator',
    category: 'third_party',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['chargebacks', 'root_cause_analysis', 'prevention_alerts', 'auto_representment', 'intelligent_routing'],
  },
  SIGNIFYD: {
    displayName: 'Signifyd',
    category: 'third_party',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['chargebacks', 'guaranteed_protection', 'abuse_prevention', 'payment_optimization', 'chargeback_recovery'],
  },
  RISKIFIED: {
    displayName: 'Riskified',
    category: 'third_party',
    authType: 'api_key',
    cardNetworks: ['visa', 'mastercard', 'amex', 'discover'],
    twoWaySync: true,
    features: ['chargebacks', 'chargeback_guarantee', 'fraud_detection', 'policy_abuse', 'behavioral_analytics'],
  },
};

/**
 * Create a dispute adapter instance for the given portal type.
 *
 * @param {string} portalType - Portal identifier (case-insensitive)
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
 * @returns {string[]} Array of supported portal type strings
 */
function getSupportedTypes() {
  return Object.keys(ADAPTERS);
}

/**
 * Check whether a given portal type has a dedicated adapter implementation.
 * @param {string} portalType - Portal identifier (case-insensitive)
 * @returns {boolean}
 */
function isSupported(portalType) {
  return !!ADAPTERS[portalType?.toUpperCase()];
}

/**
 * Get metadata for a specific portal type.
 * @param {string} portalType
 * @returns {Object|null}
 */
function getMetadata(portalType) {
  return PORTAL_METADATA[portalType?.toUpperCase()] || null;
}

/**
 * Get metadata for all supported portal types.
 * @returns {Object}
 */
function getAllMetadata() {
  return { ...PORTAL_METADATA };
}

/**
 * Get portal types filtered by category.
 * @param {'prevention'|'card_network'|'processor'|'third_party'} category
 * @returns {string[]}
 */
function getTypesByCategory(category) {
  return Object.entries(PORTAL_METADATA)
    .filter(([_, meta]) => meta.category === category)
    .map(([key]) => key);
}

/**
 * Get portal types that support a specific card network.
 * @param {'visa'|'mastercard'|'amex'|'discover'} network
 * @returns {string[]}
 */
function getTypesByCardNetwork(network) {
  return Object.entries(PORTAL_METADATA)
    .filter(([_, meta]) => meta.cardNetworks.includes(network) || meta.cardNetworks.includes('all'))
    .map(([key]) => key);
}

module.exports = {
  createDisputeAdapter,
  getSupportedTypes,
  isSupported,
  getMetadata,
  getAllMetadata,
  getTypesByCategory,
  getTypesByCardNetwork,
  ADAPTERS,
  PORTAL_METADATA,
};
