/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * PMS Adapter Factory
 *
 * Central factory for creating PMS adapter instances.
 *
 * Usage:
 *   const { createAdapter } = require('./PMSAdapterFactory');
 *
 *   const adapter = createAdapter('OPERA_CLOUD', {
 *     baseUrl: 'https://api.oracle.com/opera/v1',
 *     credentials: { clientId: '...', clientSecret: '...', hotelId: 'HTLNYC' },
 *     propertyId: 'prop_abc123',
 *   });
 *
 *   await adapter.authenticate();
 *   const reservation = await adapter.getReservation('RES-12345');
 */

'use strict';

const OperaCloudAdapter = require('./OperaCloudAdapter');
const MewsAdapter = require('./MewsAdapter');
const CloudbedsAdapter = require('./CloudbedsAdapter');
const AutoClerkAdapter = require('./AutoClerkAdapter');

/**
 * Map of supported PMS type identifiers to their adapter classes.
 * Keys are uppercase to allow case-insensitive lookups.
 */
const ADAPTERS = {
  OPERA_CLOUD: OperaCloudAdapter,
  MEWS: MewsAdapter,
  CLOUDBEDS: CloudbedsAdapter,
  AUTOCLERK: AutoClerkAdapter,
};

/**
 * Metadata about each supported PMS (used by the UI and health dashboard).
 */
const PMS_METADATA = {
  OPERA_CLOUD: {
    displayName: 'Oracle Opera Cloud',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  MEWS: {
    displayName: 'Mews Systems',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  CLOUDBEDS: {
    displayName: 'Cloudbeds',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks'],
  },
  AUTOCLERK: {
    displayName: 'AutoClerk PMS',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    features: [
      'reservations', 'folios', 'profiles', 'rates', 'notes', 'flags',
      'webhooks', 'documents', 'signature_capture', 'id_verification', 'audit_trail',
    ],
  },
};

/**
 * Create a PMS adapter instance for the given PMS type.
 *
 * @param {string} pmsType - One of: OPERA_CLOUD, MEWS, CLOUDBEDS, AUTOCLERK (case-insensitive).
 * @param {Object} config  - Adapter configuration.
 * @param {string} [config.baseUrl]         - Override default API base URL.
 * @param {Object}  config.credentials      - Decrypted PMS credentials.
 * @param {string} [config.propertyId]      - AccuDefend property ID.
 * @param {string} [config.integrationId]   - AccuDefend Integration row ID.
 * @param {Object} [config.httpOptions]     - Override httpClientFactory options.
 * @returns {BasePMSAdapter} Concrete adapter instance (not yet authenticated).
 * @throws {Error} If pmsType is not supported.
 */
function createAdapter(pmsType, config) {
  const key = pmsType?.toUpperCase();
  const AdapterClass = ADAPTERS[key];

  if (!AdapterClass) {
    const supported = Object.keys(ADAPTERS).join(', ');
    throw new Error(
      `No adapter available for PMS type: "${pmsType}". Supported types: ${supported}`
    );
  }

  return new AdapterClass({ ...config, pmsType: key });
}

/**
 * Get the list of all supported PMS type identifiers.
 * @returns {string[]}
 */
function getSupportedTypes() {
  return Object.keys(ADAPTERS);
}

/**
 * Check whether a PMS type is supported.
 * @param {string} pmsType - Case-insensitive PMS identifier.
 * @returns {boolean}
 */
function isSupported(pmsType) {
  return !!ADAPTERS[pmsType?.toUpperCase()];
}

/**
 * Get metadata for a specific PMS type (display name, auth type, features, etc.).
 * @param {string} pmsType
 * @returns {Object|null}
 */
function getMetadata(pmsType) {
  return PMS_METADATA[pmsType?.toUpperCase()] || null;
}

/**
 * Get metadata for all supported PMS types, keyed by type identifier.
 * @returns {Object}
 */
function getAllMetadata() {
  return { ...PMS_METADATA };
}

module.exports = {
  createAdapter,
  getSupportedTypes,
  isSupported,
  getMetadata,
  getAllMetadata,
  ADAPTERS,
  PMS_METADATA,
};
