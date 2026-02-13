/**
 * AccuDefend - PMS Integration Page
 * Connect to Property Management Systems and fetch evidence directly
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api, formatRelativeTime } from '../utils/api';
import {
  Building2,
  Link2,
  Unlink,
  Search,
  FileText,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  Shield,
  Clock,
  Database,
  ArrowRight,
  ArrowLeftRight,
  Key,
  User,
  Lock,
  ExternalLink,
  Zap,
  Check,
  X,
  Eye,
  Paperclip,
  Activity,
  TrendingUp,
  AlertOctagon
} from 'lucide-react';

// PMS Systems with their details
const PMS_SYSTEMS = [
  {
    id: 'AUTOCLERK',
    name: 'AutoClerk PMS',
    logo: '🏨',
    authType: 'api_key',
    twoWaySync: true,
    features: ['Real-time Sync', 'Auto Evidence', 'Guest Flags', 'Document Upload'],
    description: 'Full two-way integration with AutoClerk for seamless evidence collection'
  },
  {
    id: 'OPERA_CLOUD',
    name: 'Oracle Opera Cloud',
    logo: '🔴',
    authType: 'oauth2',
    twoWaySync: true,
    features: ['OAuth 2.0', 'Webhooks', 'Document Sync', 'Guest Notes'],
    description: 'Enterprise PMS integration with Oracle Opera Cloud'
  },
  {
    id: 'MEWS',
    name: 'Mews Systems',
    logo: '🟢',
    authType: 'api_key',
    twoWaySync: true,
    features: ['API Integration', 'Real-time Events', 'Billing Sync'],
    description: 'Modern cloud PMS with comprehensive API access'
  },
  {
    id: 'CLOUDBEDS',
    name: 'Cloudbeds',
    logo: '☁️',
    authType: 'oauth2',
    twoWaySync: true,
    features: ['OAuth 2.0', 'Guest Profiles', 'Payment Records'],
    description: 'All-in-one hospitality management platform'
  },
  {
    id: 'PROTEL',
    name: 'protel PMS',
    logo: '🔵',
    authType: 'basic',
    twoWaySync: true,
    features: ['Basic Auth', 'Folio Export', 'Guest Data'],
    description: 'Industry-leading hotel management software'
  },
  {
    id: 'STAYNTOUCH',
    name: 'StayNTouch',
    logo: '📱',
    authType: 'oauth2',
    twoWaySync: true,
    features: ['Mobile-first', 'Digital Signatures', 'Real-time'],
    description: 'Mobile PMS with digital signature capture'
  },
  {
    id: 'APALEO',
    name: 'Apaleo',
    logo: '🟣',
    authType: 'oauth2',
    twoWaySync: true,
    features: ['Open API', 'Webhooks', 'Folio Access'],
    description: 'Open hospitality platform with extensive API'
  },
  {
    id: 'INNROAD',
    name: 'innRoad',
    logo: '🛣️',
    authType: 'oauth2',
    twoWaySync: true,
    features: ['Cloud-based', 'Reporting', 'Payment Integration'],
    description: 'Cloud-based property management for independents'
  },
  {
    id: 'WEBREZPRO',
    name: 'WebRezPro',
    logo: '🌐',
    authType: 'api_key',
    twoWaySync: false,
    features: ['API Access', 'Booking Data', 'Guest Info'],
    description: 'Cloud-based PMS for small to mid-size properties'
  },
  {
    id: 'ROOMMASTER',
    name: 'RoomMaster',
    logo: '🏠',
    authType: 'basic',
    twoWaySync: false,
    features: ['Legacy Support', 'Basic Export', 'Folio Data'],
    description: 'Trusted PMS solution for hotels worldwide'
  },
  {
    id: 'LITTLE_HOTELIER',
    name: 'Little Hotelier',
    logo: '🏡',
    authType: 'api_key',
    twoWaySync: false,
    features: ['Small Properties', 'Simple Integration'],
    description: 'Designed for small accommodation providers'
  },
  {
    id: 'ROOMKEY',
    name: 'RoomKeyPMS',
    logo: '🔑',
    authType: 'api_key',
    twoWaySync: true,
    features: ['API Access', 'Guest Profiles', 'Billing'],
    description: 'Cloud-based hotel management software'
  }
];

export default function PMSIntegration() {
  const [activeTab, setActiveTab] = useState('connect');
  const [connections, setConnections] = useState([]);
  const [selectedPMS, setSelectedPMS] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionForm, setConnectionForm] = useState({
    apiKey: '',
    apiSecret: '',
    username: '',
    password: '',
    hotelCode: ''
  });
  const [searchParams, setSearchParams] = useState({
    confirmationNumber: '',
    guestName: '',
    cardLast4: ''
  });
  const [searchResults, setSearchResults] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingEvidence, setIsFetchingEvidence] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState([]);

  // Simulate initial connection (for demo)
  useEffect(() => {
    // Demo: Show AutoClerk as connected
    setConnections([
      {
        id: 'conn-demo-1',
        pmsType: 'AUTOCLERK',
        pmsName: 'AutoClerk PMS',
        status: 'connected',
        connectedAt: new Date(Date.now() - 86400000).toISOString(),
        lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
        syncEnabled: true
      }
    ]);
  }, []);

  const handleConnect = async (pms) => {
    setSelectedPMS(pms);
  };

  const handleSubmitConnection = async () => {
    setIsConnecting(true);

    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    const newConnection = {
      id: `conn-${Date.now()}`,
      pmsType: selectedPMS.id,
      pmsName: selectedPMS.name,
      status: 'connected',
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      syncEnabled: selectedPMS.twoWaySync
    };

    setConnections([...connections, newConnection]);
    setIsConnecting(false);
    setSelectedPMS(null);
    setConnectionForm({ apiKey: '', apiSecret: '', username: '', password: '', hotelCode: '' });
  };

  const handleDisconnect = async (connectionId) => {
    setConnections(connections.filter(c => c.id !== connectionId));
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchResults(null);
    setEvidence([]);

    // Simulate search
    await new Promise(resolve => setTimeout(resolve, 1500));

    setSearchResults({
      found: true,
      reservation: {
        confirmationNumber: searchParams.confirmationNumber || 'RES-2024-78542',
        guestName: searchParams.guestName || 'John Smith',
        email: 'john.smith@email.com',
        phone: '+1 (555) 123-4567',
        checkIn: '2024-01-15',
        checkOut: '2024-01-18',
        roomNumber: '405',
        roomType: 'Deluxe King',
        totalAmount: 847.50,
        paymentMethod: `Card ending ${searchParams.cardLast4 || '4242'}`,
        status: 'checked_out'
      }
    });

    setIsSearching(false);
  };

  const handleFetchEvidence = async () => {
    setIsFetchingEvidence(true);

    // Simulate fetching evidence
    await new Promise(resolve => setTimeout(resolve, 2000));

    setEvidence([
      {
        id: 'ev-1',
        type: 'folio',
        label: 'Guest Folio',
        description: 'Complete guest folio with all charges',
        fileName: 'folio_RES-2024-78542.pdf',
        fileSize: '240 KB',
        status: 'ready',
        preview: { totalCharges: 847.50, roomCharges: 675.00, taxes: 87.50, incidentals: 85.00 }
      },
      {
        id: 'ev-2',
        type: 'registration_card',
        label: 'Registration Card',
        description: 'Signed guest registration card',
        fileName: 'reg_card_RES-2024-78542.pdf',
        fileSize: '152 KB',
        status: 'ready',
        preview: { signaturePresent: true, idVerified: true, signedAt: '2024-01-15 3:45 PM' }
      },
      {
        id: 'ev-3',
        type: 'payment_receipt',
        label: 'Payment Receipt',
        description: 'Credit card authorization and payment',
        fileName: 'payment_RES-2024-78542.pdf',
        fileSize: '96 KB',
        status: 'ready',
        preview: { authCode: 'AUTH123456', cardType: 'Visa', last4: '4242', amount: 847.50 }
      },
      {
        id: 'ev-4',
        type: 'guest_signature',
        label: 'Digital Signature',
        description: 'Guest signature from check-in',
        fileName: 'signature_RES-2024-78542.png',
        fileSize: '44 KB',
        status: 'ready',
        preview: { capturedAt: '2024-01-15 3:45 PM', device: 'Front Desk Terminal #2' }
      },
      {
        id: 'ev-5',
        type: 'id_scan',
        label: 'ID Document Scan',
        description: 'Scanned identification document',
        fileName: 'id_scan_RES-2024-78542.pdf',
        fileSize: '500 KB',
        status: 'ready',
        preview: { documentType: 'Drivers License', verified: true }
      },
      {
        id: 'ev-6',
        type: 'reservation',
        label: 'Booking Confirmation',
        description: 'Original reservation details',
        fileName: 'booking_RES-2024-78542.pdf',
        fileSize: '122 KB',
        status: 'ready',
        preview: { bookingSource: 'Direct Website', bookedOn: '2024-01-10', ipAddress: '192.168.x.x' }
      }
    ]);

    setIsFetchingEvidence(false);
  };

  const toggleEvidenceSelection = (evidenceId) => {
    if (selectedEvidence.includes(evidenceId)) {
      setSelectedEvidence(selectedEvidence.filter(id => id !== evidenceId));
    } else {
      setSelectedEvidence([...selectedEvidence, evidenceId]);
    }
  };

  const handleAttachToCase = () => {
    alert(`Attaching ${selectedEvidence.length} evidence documents to case...`);
    setSelectedEvidence([]);
  };

  const renderConnectionForm = () => {
    if (!selectedPMS) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">{selectedPMS.logo}</span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Connect to {selectedPMS.name}</h3>
                <p className="text-sm text-gray-500">{selectedPMS.authType === 'oauth2' ? 'OAuth 2.0' : selectedPMS.authType === 'api_key' ? 'API Key' : 'Basic Auth'}</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedPMS(null)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {selectedPMS.authType === 'api_key' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={connectionForm.apiKey}
                    onChange={(e) => setConnectionForm({ ...connectionForm, apiKey: e.target.value })}
                    placeholder="Enter your API key"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Secret (optional)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={connectionForm.apiSecret}
                    onChange={(e) => setConnectionForm({ ...connectionForm, apiSecret: e.target.value })}
                    placeholder="Enter your API secret"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {selectedPMS.authType === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={connectionForm.username}
                    onChange={(e) => setConnectionForm({ ...connectionForm, username: e.target.value })}
                    placeholder="Enter username"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={connectionForm.password}
                    onChange={(e) => setConnectionForm({ ...connectionForm, password: e.target.value })}
                    placeholder="Enter password"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hotel Code</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={connectionForm.hotelCode}
                    onChange={(e) => setConnectionForm({ ...connectionForm, hotelCode: e.target.value })}
                    placeholder="Enter hotel code"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {selectedPMS.authType === 'oauth2' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ExternalLink className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-gray-600 mb-4">
                You'll be redirected to {selectedPMS.name} to authorize AccuDefend
              </p>
              <p className="text-sm text-gray-500">
                This allows secure access to reservation and payment data
              </p>
            </div>
          )}

          <div className="mt-6 flex space-x-3">
            <button
              onClick={() => setSelectedPMS(null)}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitConnection}
              disabled={isConnecting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  <span>Connect</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PMS Integration</h1>
          <p className="text-gray-500 mt-1">Connect to your Property Management System to fetch evidence directly</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            {connections.length} Connected
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'connect', label: 'Connect PMS', icon: Link2 },
            { id: 'search', label: 'Search & Fetch', icon: Search },
            { id: 'sync', label: 'Sync Status', icon: RefreshCw }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-4 px-1 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Connect Tab */}
      {activeTab === 'connect' && (
        <div className="space-y-6">
          {/* Active Connections */}
          {connections.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-900">Active Connections</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {connections.map((conn) => {
                  const pms = PMS_SYSTEMS.find(p => p.id === conn.pmsType);
                  return (
                    <div key={conn.id} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <span className="text-2xl">{pms?.logo}</span>
                        <div>
                          <h4 className="font-medium text-gray-900">{conn.pmsName}</h4>
                          <div className="flex items-center space-x-3 text-sm text-gray-500">
                            <span className="flex items-center">
                              <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                              Connected
                            </span>
                            {conn.syncEnabled && (
                              <span className="flex items-center">
                                <ArrowLeftRight className="w-4 h-4 text-blue-500 mr-1" />
                                Two-way sync
                              </span>
                            )}
                            {conn.lastSyncAt && (
                              <span className="flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                Last sync: {new Date(conn.lastSyncAt).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Sync Now">
                          <RefreshCw className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDisconnect(conn.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500"
                          title="Disconnect"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available PMS Systems */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Available PMS Systems</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PMS_SYSTEMS.map((pms) => {
                const isConnected = connections.some(c => c.pmsType === pms.id);
                return (
                  <div
                    key={pms.id}
                    className={`bg-white rounded-xl border p-5 transition-all ${
                      isConnected ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{pms.logo}</span>
                        <div>
                          <h4 className="font-semibold text-gray-900">{pms.name}</h4>
                          {pms.twoWaySync && (
                            <span className="inline-flex items-center text-xs text-blue-600">
                              <ArrowLeftRight className="w-3 h-3 mr-1" />
                              Two-way sync
                            </span>
                          )}
                        </div>
                      </div>
                      {isConnected && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{pms.description}</p>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {pms.features.slice(0, 3).map((feature, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                          {feature}
                        </span>
                      ))}
                    </div>
                    {!isConnected ? (
                      <button
                        onClick={() => handleConnect(pms)}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                      >
                        <Link2 className="w-4 h-4" />
                        <span>Connect</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full py-2 bg-green-100 text-green-700 rounded-lg flex items-center justify-center space-x-2"
                      >
                        <Check className="w-4 h-4" />
                        <span>Connected</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search & Fetch Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Form */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Search Reservation</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Number</label>
                <input
                  type="text"
                  value={searchParams.confirmationNumber}
                  onChange={(e) => setSearchParams({ ...searchParams, confirmationNumber: e.target.value })}
                  placeholder="e.g., RES-2024-78542"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
                <input
                  type="text"
                  value={searchParams.guestName}
                  onChange={(e) => setSearchParams({ ...searchParams, guestName: e.target.value })}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Card Last 4 Digits</label>
                <input
                  type="text"
                  value={searchParams.cardLast4}
                  onChange={(e) => setSearchParams({ ...searchParams, cardLast4: e.target.value })}
                  placeholder="e.g., 4242"
                  maxLength={4}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={handleSearch}
                disabled={isSearching || connections.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Search PMS</span>
                  </>
                )}
              </button>
              {connections.length === 0 && (
                <p className="text-sm text-amber-600 mt-2">Please connect a PMS first to search reservations</p>
              )}
            </div>
          </div>

          {/* Search Results */}
          {searchResults && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-green-50 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <h3 className="font-semibold text-gray-900">Reservation Found</h3>
                </div>
                <button
                  onClick={handleFetchEvidence}
                  disabled={isFetchingEvidence}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  {isFetchingEvidence ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Fetch All Evidence</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Confirmation #</p>
                    <p className="font-semibold text-gray-900">{searchResults.reservation.confirmationNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Guest Name</p>
                    <p className="font-semibold text-gray-900">{searchResults.reservation.guestName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Check-in</p>
                    <p className="font-semibold text-gray-900">{searchResults.reservation.checkIn}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Check-out</p>
                    <p className="font-semibold text-gray-900">{searchResults.reservation.checkOut}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Room</p>
                    <p className="font-semibold text-gray-900">{searchResults.reservation.roomNumber} - {searchResults.reservation.roomType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="font-semibold text-gray-900">${searchResults.reservation.totalAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Payment Method</p>
                    <p className="font-semibold text-gray-900">{searchResults.reservation.paymentMethod}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                      {searchResults.reservation.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Evidence List */}
          {evidence.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Available Evidence</h3>
                  <p className="text-sm text-gray-500">{evidence.length} documents fetched from PMS</p>
                </div>
                {selectedEvidence.length > 0 && (
                  <button
                    onClick={handleAttachToCase}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                  >
                    <Paperclip className="w-4 h-4" />
                    <span>Attach {selectedEvidence.length} to Case</span>
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-200">
                {evidence.map((item) => (
                  <div
                    key={item.id}
                    className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer ${
                      selectedEvidence.includes(item.id) ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => toggleEvidenceSelection(item.id)}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                        selectedEvidence.includes(item.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300'
                      }`}>
                        {selectedEvidence.includes(item.id) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{item.label}</h4>
                        <p className="text-sm text-gray-500">{item.description}</p>
                        <div className="flex items-center space-x-3 mt-1 text-xs text-gray-400">
                          <span>{item.fileName}</span>
                          <span>•</span>
                          <span>{item.fileSize}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Preview: ${JSON.stringify(item.preview, null, 2)}`);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Downloading ${item.fileName}...`);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Status Tab */}
      {activeTab === 'sync' && (
        <SyncStatusTab connections={connections} setActiveTab={setActiveTab} />
      )}

      {/* Connection Modal */}
      {renderConnectionForm()}
    </div>
  );
}

// =============================================
// Sync Status Tab - Uses real API data
// =============================================
function SyncStatusTab({ connections, setActiveTab }) {
  const [syncData, setSyncData] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [showLogs, setShowLogs] = useState(false);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const response = await api.get('/sync/status');
      setSyncData(response.data);
    } catch (error) {
      console.debug('Could not fetch sync status:', error.message);
      // Fall back to showing connections without sync data
      setSyncData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSyncLogs = useCallback(async () => {
    try {
      const response = await api.get('/sync/logs?limit=20');
      setSyncLogs(response.data.logs || []);
    } catch (error) {
      console.debug('Could not fetch sync logs:', error.message);
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
    fetchSyncLogs();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchSyncStatus();
      fetchSyncLogs();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus, fetchSyncLogs]);

  const handleTriggerSync = async (integrationId, integrationName) => {
    setSyncing(prev => ({ ...prev, [integrationId]: true }));
    try {
      await api.post('/sync/trigger', { integrationId, syncType: 'incremental' });
      // Refresh status after triggering
      setTimeout(() => {
        fetchSyncStatus();
        fetchSyncLogs();
      }, 2000);
    } catch (error) {
      console.error(`Sync trigger failed for ${integrationName}:`, error.message);
    } finally {
      setTimeout(() => {
        setSyncing(prev => ({ ...prev, [integrationId]: false }));
      }, 3000);
    }
  };

  const getSyncStatusBadge = (status) => {
    const badges = {
      completed: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500', label: 'Healthy' },
      failed: { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500', label: 'Error' },
      started: { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500', label: 'Running' },
      partial: { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500', label: 'Partial' },
    };
    return badges[status] || badges.completed;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Overview Cards */}
      {syncData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Integrations</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{syncData.integrations?.length || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Link2 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Synced Records</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {syncData.integrations?.reduce((sum, i) =>
                    sum + (i.counts?.reservationsSynced || 0) + (i.counts?.chargebacksSynced || 0), 0
                  ) || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Queue Health</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {syncData.queues?.error ? 'Offline' : 'Online'}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                syncData.queues?.error ? 'bg-red-100' : 'bg-green-100'
              }`}>
                <Activity className={`w-6 h-6 ${
                  syncData.queues?.error ? 'text-red-600' : 'text-green-600'
                }`} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Integration Sync Status */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Two-Way Sync Status</h3>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-1"
            >
              <FileText className="w-4 h-4" />
              <span>{showLogs ? 'Hide Logs' : 'View Logs'}</span>
            </button>
            <button
              onClick={fetchSyncStatus}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-1"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {syncData && syncData.integrations?.length > 0 ? (
            <div className="space-y-6">
              {syncData.integrations.map((item) => {
                const pms = PMS_SYSTEMS.find(p => p.id === item.integration.type?.toUpperCase());
                const badge = getSyncStatusBadge(item.lastSync?.status);
                const isSyncing = syncing[item.integration.id];

                return (
                  <div key={item.integration.id} className="border border-gray-200 rounded-lg p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{pms?.logo || '🔗'}</span>
                        <div>
                          <h4 className="font-medium text-gray-900">{item.integration.name}</h4>
                          <p className="text-sm text-gray-500">
                            {item.integration.type} {item.integration.syncEnabled && '• Two-way sync enabled'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
                          <span className={`w-2 h-2 rounded-full mr-2 ${badge.dot}`}></span>
                          {badge.label}
                        </span>
                        <button
                          onClick={() => handleTriggerSync(item.integration.id, item.integration.name)}
                          disabled={isSyncing}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-1"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                          <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center space-x-2 text-gray-500 mb-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Last Sync</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">
                          {item.lastSync?.at ? formatRelativeTime(item.lastSync.at) : 'Never'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.lastSync?.status || 'pending'}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center space-x-2 text-gray-500 mb-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Success Rate</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">
                          {item.health?.successRate || 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">last 24h</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center space-x-2 text-gray-500 mb-1">
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Syncs (24h)</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">
                          {item.health?.syncsLast24h || 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.health?.failuresLast24h || 0} failed
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center space-x-2 text-gray-500 mb-1">
                          <Database className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Reservations</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">
                          {item.counts?.reservationsSynced || 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">synced</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center space-x-2 text-gray-500 mb-1">
                          <AlertOctagon className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Chargebacks</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">
                          {item.counts?.chargebacksSynced || 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">synced</p>
                      </div>
                    </div>

                    {/* Recent Sync Activity */}
                    {item.recentSyncs?.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <h5 className="text-xs font-medium text-gray-500 uppercase mb-2">Recent Activity</h5>
                        <div className="space-y-1.5">
                          {item.recentSyncs.slice(0, 3).map((sync) => (
                            <div key={sync.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center space-x-2">
                                {sync.status === 'completed' ? (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                ) : sync.status === 'failed' ? (
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                ) : (
                                  <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                                )}
                                <span className="text-gray-700">
                                  {sync.direction === 'inbound' ? '↓' : '↑'} {sync.entityType || sync.syncType}
                                </span>
                                {sync.recordsProcessed > 0 && (
                                  <span className="text-gray-400 text-xs">
                                    ({sync.recordsProcessed} records)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 text-xs text-gray-400">
                                {sync.durationMs && <span>{(sync.durationMs / 1000).toFixed(1)}s</span>}
                                <span>{formatRelativeTime(sync.startedAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sync Capabilities */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <h5 className="text-xs font-medium text-gray-500 uppercase mb-2">Sync Capabilities</h5>
                      <div className="flex flex-wrap gap-2">
                        {['Reservations', 'Guest Profiles', 'Folios', 'Payments', 'Documents', 'Notes'].map((cap, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
                            <Check className="w-3 h-3 mr-1" />
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : connections.length > 0 ? (
            /* Show connections when API returns no sync data but there are local connections */
            <div className="space-y-4">
              {connections.map((conn) => {
                const pms = PMS_SYSTEMS.find(p => p.id === conn.pmsType);
                return (
                  <div key={conn.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{pms?.logo}</span>
                        <div>
                          <h4 className="font-medium text-gray-900">{conn.pmsName}</h4>
                          <p className="text-sm text-gray-500">
                            Connected {new Date(conn.connectedAt).toLocaleDateString()}
                            {conn.syncEnabled && ' • Two-way sync'}
                          </p>
                        </div>
                      </div>
                      <span className="flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                        Active
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No PMS Connected</h4>
              <p className="text-gray-500 mb-4">Connect a Property Management System to enable two-way sync</p>
              <button
                onClick={() => setActiveTab('connect')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Connect PMS
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sync Logs Panel */}
      {showLogs && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Sync Logs</h3>
          </div>
          <div className="overflow-x-auto">
            {syncLogs.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {syncLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {log.status === 'completed' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Success
                          </span>
                        ) : log.status === 'failed' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Running
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{log.syncType}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${log.direction === 'inbound' ? 'text-blue-600' : 'text-purple-600'}`}>
                          {log.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{log.entityType || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.recordsProcessed || 0}
                        {log.recordsFailed > 0 && (
                          <span className="text-red-500 ml-1">({log.recordsFailed} failed)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatRelativeTime(log.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>No sync logs yet</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
