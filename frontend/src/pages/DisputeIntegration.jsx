/**
 * AccuDefend - Dispute Companies Integration Page
 * Connect to Dispute Management Platforms including Merlink (2-way), Verifi, Ethoca, and more
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Link2,
  Unlink,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  ArrowLeftRight,
  Key,
  Lock,
  Building2,
  ExternalLink,
  Zap,
  Check,
  X,
  Clock,
  ArrowRight,
  AlertTriangle,
  CreditCard,
  Send,
  Activity,
  Settings,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { api } from '../utils/api';

// Dispute Companies organized by category
const DISPUTE_COMPANIES = {
  hospitality: [
    {
      id: 'MERLINK',
      name: 'Merlink',
      fullName: 'Merlink Dispute Management',
      logo: '🔗',
      twoWaySync: true,
      category: 'hospitality',
      features: ['Real-time Alerts', '2-Way Sync', 'Auto Evidence', 'PMS Bridge'],
      description: 'Industry-leading dispute management platform for hotels with full 2-way integration',
      authType: 'api_key'
    },
    {
      id: 'STAYSETTLE',
      name: 'StaySettle',
      fullName: 'StaySettle',
      logo: '🏨',
      twoWaySync: true,
      category: 'hospitality',
      features: ['Autopilot Resolution', 'PMS Integration', 'Smart Response'],
      description: 'Automated dispute resolution built for hotels with PMS autopilot',
      authType: 'api_key'
    },
    {
      id: 'WIN_CHARGEBACKS',
      name: 'Win Chargebacks',
      fullName: 'Win Chargebacks',
      logo: '🏆',
      twoWaySync: true,
      category: 'hospitality',
      features: ['AI-Powered', 'Booking Integration', 'Auto Dossiers'],
      description: 'AI-powered platform for automatic dispute handling with booking system integration',
      authType: 'api_key'
    },
    {
      id: 'CHARGEBACK_GURUS',
      name: 'Chargeback Gurus',
      fullName: 'Chargeback Gurus',
      logo: '🧙',
      twoWaySync: true,
      category: 'hospitality',
      features: ['Expert Management', 'Early Alerts', 'Analytics'],
      description: 'Expert dispute management with early alerts and analytics for hospitality',
      authType: 'api_key'
    },
    {
      id: 'CHARGEBACKHELP',
      name: 'ChargebackHelp',
      fullName: 'ChargebackHelp',
      logo: '🛟',
      twoWaySync: true,
      category: 'hospitality',
      features: ['Multi-Tool', 'Verifi/Ethoca', 'Visa RDR'],
      description: 'Integrates Verifi CDRN, Ethoca Alerts, and Visa RDR for travel/hospitality',
      authType: 'api_key'
    },
    {
      id: 'CLEARVIEW',
      name: 'Clearview',
      fullName: 'Clearview / Chargeback Shield',
      logo: '🛡️',
      twoWaySync: true,
      category: 'hospitality',
      features: ['Proactive Alerts', 'Auto Evidence', 'Risk Monitoring'],
      description: 'Hospitality payment solution with proactive dispute alerting',
      authType: 'api_key'
    }
  ],
  network: [
    {
      id: 'VERIFI',
      name: 'Verifi (Visa)',
      fullName: 'Verifi (Visa)',
      logo: '💳',
      twoWaySync: true,
      category: 'network',
      features: ['CDRN Alerts', 'RDR', 'Order Insight', 'Pre-Dispute'],
      description: 'Visa-owned dispute prevention with pre-dispute and RDR capabilities',
      authType: 'api_key'
    },
    {
      id: 'ETHOCA',
      name: 'Ethoca (Mastercard)',
      fullName: 'Ethoca (Mastercard)',
      logo: '🔴',
      twoWaySync: true,
      category: 'network',
      features: ['Consumer Clarity', 'Alerts', 'Eliminator', 'Issuer Network'],
      description: 'Mastercard-owned collaborative fraud and dispute resolution',
      authType: 'api_key'
    }
  ],
  general: [
    {
      id: 'CHARGEBACKS911',
      name: 'Chargebacks911',
      fullName: 'Chargebacks911',
      logo: '🚨',
      twoWaySync: true,
      category: 'general',
      features: ['Prevention', 'Recovery', 'Analytics', 'ROI Guarantee'],
      description: 'End-to-end chargeback management with prevention and recovery',
      authType: 'api_key'
    },
    {
      id: 'RISKIFIED',
      name: 'Riskified',
      fullName: 'Riskified Dispute Resolve',
      logo: '🔒',
      twoWaySync: true,
      category: 'general',
      features: ['Debt Recovery', 'Auto Representment', 'Fraud Prevention'],
      description: 'Dispute automation with auto-compiling evidence at scale',
      authType: 'api_key'
    },
    {
      id: 'CHARGEBLAST',
      name: 'Chargeblast',
      fullName: 'Chargeblast',
      logo: '💥',
      twoWaySync: true,
      category: 'general',
      features: ['Real-time Alerts', 'Evidence Compilation', 'Prevention'],
      description: 'Automated chargeback prevention with real-time alerts',
      authType: 'api_key'
    },
    {
      id: 'MIDIGATOR',
      name: 'Midigator',
      fullName: 'Midigator by CAVU',
      logo: '📊',
      twoWaySync: true,
      category: 'general',
      features: ['Dispute Intelligence', 'Auto Responses', 'Analytics'],
      description: 'Intelligent dispute management with comprehensive analytics',
      authType: 'api_key'
    },
    {
      id: 'TAILOREDPAY',
      name: 'TailoredPay',
      fullName: 'TailoredPay',
      logo: '🎯',
      twoWaySync: true,
      category: 'general',
      features: ['Fraud Prevention', 'High-Risk Support', 'Payment Services'],
      description: 'Fraud prevention and chargeback management for high-risk merchants',
      authType: 'api_key'
    }
  ]
};

// Flatten all companies for easy access
const ALL_COMPANIES = [
  ...DISPUTE_COMPANIES.hospitality,
  ...DISPUTE_COMPANIES.network,
  ...DISPUTE_COMPANIES.general
];

export default function DisputeIntegration() {
  const [activeTab, setActiveTab] = useState('connect');
  const [connections, setConnections] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(null);
  const [isSyncing, setIsSyncing] = useState(null);
  const [connectionForm, setConnectionForm] = useState({
    apiKey: '',
    apiSecret: '',
    merchantId: '',
    hotelId: ''
  });
  const [expandedCategory, setExpandedCategory] = useState('hospitality');

  // Load existing connections
  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const response = await api.get('/disputes/integrations');
      if (response.data.success) {
        setConnections(response.data.integrations);
      }
    } catch (error) {
      console.error('Failed to load dispute integrations:', error);
      // Demo data if API fails
      setConnections([
        {
          id: 'demo-merlink',
          name: 'Merlink Dispute Management',
          type: 'merlink',
          status: 'active',
          twoWaySync: true,
          logo: '🔗',
          lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
          lastSyncStatus: 'success',
          syncErrors: 0
        }
      ]);
    }
  };

  const handleConnect = (company) => {
    setSelectedCompany(company);
  };

  const handleSubmitConnection = async () => {
    setIsConnecting(true);

    try {
      const response = await api.post('/disputes/integrations', {
        companyId: selectedCompany.id,
        credentials: connectionForm,
        config: {
          autoSubmit: false,
          twoWaySync: selectedCompany.twoWaySync
        }
      });

      if (response.data.success) {
        await loadConnections();
        setSelectedCompany(null);
        setConnectionForm({ apiKey: '', apiSecret: '', merchantId: '', hotelId: '' });
      }
    } catch (error) {
      console.error('Failed to create connection:', error);
      // Demo: simulate success
      const newConnection = {
        id: `conn-${Date.now()}`,
        name: selectedCompany.fullName,
        type: selectedCompany.id.toLowerCase(),
        status: 'active',
        twoWaySync: selectedCompany.twoWaySync,
        logo: selectedCompany.logo,
        lastSyncAt: null,
        lastSyncStatus: null,
        syncErrors: 0
      };
      setConnections([...connections, newConnection]);
      setSelectedCompany(null);
      setConnectionForm({ apiKey: '', apiSecret: '', merchantId: '', hotelId: '' });
    }

    setIsConnecting(false);
  };

  const handleTestConnection = async (integrationId) => {
    setIsTesting(integrationId);
    try {
      await api.post(`/disputes/integrations/${integrationId}/test`);
    } catch (error) {
      console.error('Connection test failed:', error);
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsTesting(null);
  };

  const handleSync = async (integrationId) => {
    setIsSyncing(integrationId);
    try {
      await api.post(`/disputes/integrations/${integrationId}/sync`);
      await loadConnections();
    } catch (error) {
      console.error('Sync failed:', error);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsSyncing(null);
  };

  const handleDisconnect = async (integrationId) => {
    try {
      await api.delete(`/disputes/integrations/${integrationId}`);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
    setConnections(connections.filter(c => c.id !== integrationId));
  };

  const renderConnectionForm = () => {
    if (!selectedCompany) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">{selectedCompany.logo}</span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Connect {selectedCompany.name}</h3>
                <p className="text-sm text-gray-500">{selectedCompany.twoWaySync ? 'Two-way sync enabled' : 'One-way sync'}</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCompany(null)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

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
              <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Merchant ID</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={connectionForm.merchantId}
                  onChange={(e) => setConnectionForm({ ...connectionForm, merchantId: e.target.value })}
                  placeholder="Enter merchant ID"
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {selectedCompany.category === 'hospitality' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hotel ID (optional)</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={connectionForm.hotelId}
                    onChange={(e) => setConnectionForm({ ...connectionForm, hotelId: e.target.value })}
                    placeholder="Enter hotel ID"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {selectedCompany.twoWaySync && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-2 text-blue-700">
                <ArrowLeftRight className="w-4 h-4" />
                <span className="text-sm font-medium">Two-Way Sync Enabled</span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Cases will automatically sync between AccuDefend and {selectedCompany.name}
              </p>
            </div>
          )}

          <div className="mt-6 flex space-x-3">
            <button
              onClick={() => setSelectedCompany(null)}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitConnection}
              disabled={isConnecting || !connectionForm.apiKey || !connectionForm.merchantId}
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

  const renderCompanyCard = (company) => {
    const isConnected = connections.some(c => c.type === company.id.toLowerCase());

    return (
      <div
        key={company.id}
        className={`bg-white rounded-xl border p-5 transition-all ${
          isConnected ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
        }`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{company.logo}</span>
            <div>
              <h4 className="font-semibold text-gray-900">{company.name}</h4>
              {company.twoWaySync && (
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
        <p className="text-sm text-gray-500 mb-3">{company.description}</p>
        <div className="flex flex-wrap gap-1 mb-4">
          {company.features.slice(0, 4).map((feature, i) => (
            <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              {feature}
            </span>
          ))}
        </div>
        {!isConnected ? (
          <button
            onClick={() => handleConnect(company)}
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
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispute Companies Integration</h1>
          <p className="text-gray-500 mt-1">Connect to dispute management platforms including Merlink 2-way sync</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            {connections.filter(c => c.status === 'active').length} Active
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'connect', label: 'Connect Services', icon: Link2 },
            { id: 'status', label: 'Connection Status', icon: Activity },
            { id: 'settings', label: 'Settings', icon: Settings }
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
                <h3 className="font-semibold text-gray-900">Active Integrations</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {connections.map((conn) => {
                  const company = ALL_COMPANIES.find(c => c.id.toLowerCase() === conn.type);
                  return (
                    <div key={conn.id} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <span className="text-2xl">{conn.logo || company?.logo || '🔗'}</span>
                        <div>
                          <h4 className="font-medium text-gray-900">{conn.name}</h4>
                          <div className="flex items-center space-x-3 text-sm text-gray-500">
                            <span className={`flex items-center ${conn.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                              <span className={`w-2 h-2 rounded-full mr-1 ${conn.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                              {conn.status === 'active' ? 'Active' : 'Error'}
                            </span>
                            {conn.twoWaySync && (
                              <span className="flex items-center text-blue-600">
                                <ArrowLeftRight className="w-4 h-4 mr-1" />
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
                        <button
                          onClick={() => handleTestConnection(conn.id)}
                          disabled={isTesting === conn.id}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Test Connection"
                        >
                          {isTesting === conn.id ? (
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                        <button
                          onClick={() => handleSync(conn.id)}
                          disabled={isSyncing === conn.id}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Sync Now"
                        >
                          {isSyncing === conn.id ? (
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-gray-500" />
                          )}
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

          {/* Hospitality-Focused Section */}
          <div>
            <button
              onClick={() => setExpandedCategory(expandedCategory === 'hospitality' ? '' : 'hospitality')}
              className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 rounded-lg mb-4"
            >
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-900">Hospitality-Focused Platforms</span>
                <span className="text-sm text-blue-600">({DISPUTE_COMPANIES.hospitality.length} services)</span>
              </div>
              {expandedCategory === 'hospitality' ? (
                <ChevronDown className="w-5 h-5 text-blue-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-blue-600" />
              )}
            </button>
            {expandedCategory === 'hospitality' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DISPUTE_COMPANIES.hospitality.map(company => renderCompanyCard(company))}
              </div>
            )}
          </div>

          {/* Card Network Section */}
          <div>
            <button
              onClick={() => setExpandedCategory(expandedCategory === 'network' ? '' : 'network')}
              className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 rounded-lg mb-4"
            >
              <div className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-purple-600" />
                <span className="font-semibold text-purple-900">Card Network Tools (Visa/Mastercard)</span>
                <span className="text-sm text-purple-600">({DISPUTE_COMPANIES.network.length} services)</span>
              </div>
              {expandedCategory === 'network' ? (
                <ChevronDown className="w-5 h-5 text-purple-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-purple-600" />
              )}
            </button>
            {expandedCategory === 'network' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DISPUTE_COMPANIES.network.map(company => renderCompanyCard(company))}
              </div>
            )}
          </div>

          {/* General Platforms Section */}
          <div>
            <button
              onClick={() => setExpandedCategory(expandedCategory === 'general' ? '' : 'general')}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 rounded-lg mb-4"
            >
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-gray-600" />
                <span className="font-semibold text-gray-900">General Dispute Platforms</span>
                <span className="text-sm text-gray-600">({DISPUTE_COMPANIES.general.length} services)</span>
              </div>
              {expandedCategory === 'general' ? (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-600" />
              )}
            </button>
            {expandedCategory === 'general' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DISPUTE_COMPANIES.general.map(company => renderCompanyCard(company))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Tab */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-6">Integration Health</h3>

            {connections.length > 0 ? (
              <div className="space-y-4">
                {connections.map((conn) => {
                  const company = ALL_COMPANIES.find(c => c.id.toLowerCase() === conn.type);
                  return (
                    <div key={conn.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{conn.logo || company?.logo}</span>
                          <div>
                            <h4 className="font-medium text-gray-900">{conn.name}</h4>
                            <p className="text-sm text-gray-500">
                              {conn.twoWaySync ? 'Two-way sync enabled' : 'One-way sync'}
                            </p>
                          </div>
                        </div>
                        <span className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          conn.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          <span className={`w-2 h-2 rounded-full mr-2 ${
                            conn.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                          }`}></span>
                          {conn.status === 'active' ? 'Active' : 'Error'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center space-x-2 text-gray-500 mb-1">
                            <ArrowRight className="w-4 h-4" />
                            <span className="text-xs">Inbound</span>
                          </div>
                          <p className="text-lg font-semibold text-gray-900">12</p>
                          <p className="text-xs text-gray-500">disputes received</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center space-x-2 text-gray-500 mb-1">
                            <Send className="w-4 h-4" />
                            <span className="text-xs">Outbound</span>
                          </div>
                          <p className="text-lg font-semibold text-gray-900">8</p>
                          <p className="text-xs text-gray-500">responses sent</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center space-x-2 text-gray-500 mb-1">
                            <Clock className="w-4 h-4" />
                            <span className="text-xs">Last Sync</span>
                          </div>
                          <p className="text-lg font-semibold text-gray-900">
                            {conn.lastSyncAt ? '5m ago' : 'Never'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {conn.lastSyncStatus || 'pending'}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center space-x-2 text-gray-500 mb-1">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-xs">Errors</span>
                          </div>
                          <p className={`text-lg font-semibold ${conn.syncErrors > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {conn.syncErrors || 0}
                          </p>
                          <p className="text-xs text-gray-500">sync errors</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">No Integrations Connected</h4>
                <p className="text-gray-500 mb-4">Connect a dispute management platform to get started</p>
                <button
                  onClick={() => setActiveTab('connect')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Connect Service
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-6">Integration Settings</h3>

          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Auto-sync disputes</p>
                <p className="text-sm text-gray-500">Automatically sync new disputes from connected platforms</p>
              </div>
              <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
            </div>

            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Two-way sync enabled</p>
                <p className="text-sm text-gray-500">Push case updates back to dispute platforms</p>
              </div>
              <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
            </div>

            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Auto-submit evidence</p>
                <p className="text-sm text-gray-500">Automatically submit evidence when confidence score meets threshold</p>
              </div>
              <input type="checkbox" className="w-5 h-5 text-blue-600 rounded" />
            </div>

            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Webhook notifications</p>
                <p className="text-sm text-gray-500">Receive real-time updates via webhooks</p>
              </div>
              <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
            </div>

            <div className="pt-4">
              <h4 className="font-medium text-gray-900 mb-3">Sync Frequency</h4>
              <select className="w-full md:w-1/3 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every hour</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Connection Modal */}
      {renderConnectionForm()}
    </div>
  );
}
