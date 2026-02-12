/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Settings Page
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import {
  User,
  Building2,
  Bell,
  Shield,
  Key,
  Brain,
  FileText,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Sliders,
  Package,
  Mail,
  Plus,
  X,
  Info,
  Target,
  Check,
  CircleDot,
  HelpCircle,
  Cloud,
  Database,
  HardDrive,
  Link,
  ExternalLink
} from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  // AI Configuration State
  const [aiThresholds, setAiThresholds] = useState({
    autoSubmit: 85,
    reviewRecommended: 70,
    gatherMoreEvidence: 50
  });

  // Evidence Weights State
  const [evidenceWeights, setEvidenceWeights] = useState({
    ID_SCAN: 20,
    AUTH_SIGNATURE: 20,
    CHECKOUT_SIGNATURE: 15,
    FOLIO: 15,
    KEY_CARD_LOG: 10,
    CORRESPONDENCE: 10,
    CCTV_FOOTAGE: 5,
    CANCELLATION_POLICY: 5
  });

  // Evidence Packets State
  const [evidencePackets, setEvidencePackets] = useState({
    fraud: {
      name: 'Fraud Dispute',
      description: 'Guest claims they did not authorize the transaction',
      required: ['ID_SCAN', 'AUTH_SIGNATURE', 'FOLIO'],
      recommended: ['KEY_CARD_LOG', 'CCTV_FOOTAGE']
    },
    services_not_received: {
      name: 'Services Not Received',
      description: 'Guest claims they did not receive services',
      required: ['FOLIO', 'CHECKOUT_SIGNATURE', 'KEY_CARD_LOG'],
      recommended: ['CORRESPONDENCE', 'CCTV_FOOTAGE']
    },
    not_as_described: {
      name: 'Not As Described',
      description: 'Guest claims services differed from description',
      required: ['FOLIO', 'RESERVATION_CONFIRMATION', 'CORRESPONDENCE'],
      recommended: ['CANCELLATION_POLICY']
    },
    cancelled: {
      name: 'Cancelled Reservation',
      description: 'Guest disputes charge after cancellation',
      required: ['CANCELLATION_POLICY', 'RESERVATION_CONFIRMATION', 'CORRESPONDENCE'],
      recommended: ['FOLIO']
    },
    identity_fraud: {
      name: 'Identity Fraud',
      description: 'Suspected use of stolen identity or fraudulent ID',
      required: ['ID_SCAN', 'AUTH_SIGNATURE', 'CCTV_FOOTAGE'],
      recommended: ['FOLIO', 'KEY_CARD_LOG', 'CORRESPONDENCE']
    },
    guest_behavior_abuse: {
      name: 'Guest Behavior Abuse',
      description: 'Damages, policy violations, or abusive behavior charges',
      required: ['FOLIO', 'INCIDENT_REPORT', 'CCTV_FOOTAGE'],
      recommended: ['CORRESPONDENCE', 'DAMAGE_PHOTOS', 'POLICE_REPORT']
    },
    no_show: {
      name: 'No Show',
      description: 'Guest failed to arrive for guaranteed reservation',
      required: ['RESERVATION_CONFIRMATION', 'CANCELLATION_POLICY', 'FOLIO'],
      recommended: ['CORRESPONDENCE', 'NO_SHOW_DOCUMENTATION']
    },
    occupancy_fraud: {
      name: 'Occupancy Fraud',
      description: 'Unauthorized guests, extended stays, or room misuse',
      required: ['KEY_CARD_LOG', 'FOLIO', 'CCTV_FOOTAGE'],
      recommended: ['INCIDENT_REPORT', 'CHECKOUT_SIGNATURE', 'CORRESPONDENCE']
    }
  });

  // Email Notification Settings
  const [emailSettings, setEmailSettings] = useState({
    enabled: true,
    recipients: ['chargebacks@accudefend.com'],
    newCaseAlert: true,
    dueDateReminder: true,
    dueDateReminderDays: 3,
    caseResolution: true,
    weeklyDigest: false,
    digestDay: 'monday',
    ccManagers: true
  });

  const [newEmail, setNewEmail] = useState('');
  const [selectedDisputeType, setSelectedDisputeType] = useState('fraud');

  // Load configuration on mount
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/config');
      const config = response.data.config;

      if (config.ai_thresholds) {
        setAiThresholds(config.ai_thresholds);
      }
      if (config.evidence_weights) {
        setEvidenceWeights(config.evidence_weights);
      }
      if (config.evidence_packets) {
        setEvidencePackets(config.evidence_packets);
      }
      if (config.email_settings) {
        setEmailSettings(config.email_settings);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (key, value, description) => {
    setSaving(true);
    setMessage(null);
    try {
      await api.put('/admin/config', { key, value, description });
      setMessage({ type: 'success', text: `${description} saved successfully!` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to save ${description.toLowerCase()}` });
    } finally {
      setSaving(false);
    }
  };

  const saveAllSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await Promise.all([
        api.put('/admin/config', { key: 'ai_thresholds', value: aiThresholds, description: 'AI thresholds' }),
        api.put('/admin/config', { key: 'evidence_weights', value: evidenceWeights, description: 'Evidence weights' }),
        api.put('/admin/config', { key: 'evidence_packets', value: evidencePackets, description: 'Evidence packets' }),
        api.put('/admin/config', { key: 'email_settings', value: emailSettings, description: 'Email settings' })
      ]);
      setMessage({ type: 'success', text: 'All settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save some settings' });
    } finally {
      setSaving(false);
    }
  };

  const addEmailRecipient = () => {
    if (newEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      if (!emailSettings.recipients.includes(newEmail)) {
        setEmailSettings(prev => ({
          ...prev,
          recipients: [...prev.recipients, newEmail]
        }));
      }
      setNewEmail('');
    }
  };

  const removeEmailRecipient = (email) => {
    setEmailSettings(prev => ({
      ...prev,
      recipients: prev.recipients.filter(e => e !== email)
    }));
  };

  const toggleEvidenceType = (disputeType, evidenceType, category) => {
    setEvidencePackets(prev => {
      const packet = { ...prev[disputeType] };
      const otherCategory = category === 'required' ? 'recommended' : 'required';

      // Remove from other category if present
      packet[otherCategory] = packet[otherCategory].filter(t => t !== evidenceType);

      // Toggle in current category
      if (packet[category].includes(evidenceType)) {
        packet[category] = packet[category].filter(t => t !== evidenceType);
      } else {
        packet[category] = [...packet[category], evidenceType];
      }

      return { ...prev, [disputeType]: packet };
    });
  };

  const totalWeight = Object.values(evidenceWeights).reduce((a, b) => a + b, 0);

  const evidenceTypes = [
    { id: 'ID_SCAN', label: 'ID Scan', description: 'Government-issued photo ID of the guest' },
    { id: 'AUTH_SIGNATURE', label: 'Authorization Signature', description: 'Signed credit card authorization' },
    { id: 'CHECKOUT_SIGNATURE', label: 'Checkout Signature', description: 'Guest signature at checkout' },
    { id: 'FOLIO', label: 'Folio/Invoice', description: 'Detailed hotel bill and charges' },
    { id: 'RESERVATION_CONFIRMATION', label: 'Reservation Confirmation', description: 'Booking confirmation sent to guest' },
    { id: 'CANCELLATION_POLICY', label: 'Cancellation Policy', description: 'Policy agreed to during booking' },
    { id: 'CANCELLATION_POLICY_VIOLATION', label: 'Policy Violation Documentation', description: 'Proof guest cancelled outside policy terms' },
    { id: 'KEY_CARD_LOG', label: 'Key Card Log', description: 'Room access records' },
    { id: 'CCTV_FOOTAGE', label: 'CCTV Footage', description: 'Video evidence of guest presence' },
    { id: 'CORRESPONDENCE', label: 'Correspondence', description: 'Emails/messages with guest' },
    { id: 'INCIDENT_REPORT', label: 'Incident Report', description: 'Staff-documented incident details' },
    { id: 'DAMAGE_PHOTOS', label: 'Damage Photos', description: 'Photos of property damage' },
    { id: 'POLICE_REPORT', label: 'Police Report', description: 'Law enforcement documentation' },
    { id: 'NO_SHOW_DOCUMENTATION', label: 'No Show Documentation', description: 'Proof of non-arrival and hold policy' },
    { id: 'OTHER', label: 'Other Documents', description: 'Additional supporting evidence' }
  ];

  // Storage Settings State
  const [storageConfig, setStorageConfig] = useState({
    type: 's3',
    s3: {
      bucket: '',
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: ''
    }
  });

  const [storageStatus, setStorageStatus] = useState(null);

  const testStorageConnection = async () => {
    setSaving(true);
    try {
      const response = await api.get('/admin/storage/status');
      setStorageStatus(response.data);
      setMessage({ type: 'success', text: 'Storage connection successful!' });
    } catch (error) {
      setStorageStatus({ connected: false, error: error.message });
      setMessage({ type: 'error', text: 'Storage connection failed' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    ...(user?.role === 'ADMIN' ? [
      { id: 'defense', label: 'Defense Configuration', icon: Shield },
      { id: 'email', label: 'Email Settings', icon: Mail },
      { id: 'storage', label: 'Storage', icon: Cloud }
    ] : [])
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Manage your account and system configuration</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex space-x-6 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="max-w-6xl">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="w-4 h-4" /> Profile Information
                </h3>
              </div>
              <div className="card-body space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">First Name</label>
                    <input type="text" value={user?.firstName || ''} className="input" readOnly />
                  </div>
                  <div>
                    <label className="label">Last Name</label>
                    <input type="text" value={user?.lastName || ''} className="input" readOnly />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Email</label>
                    <input type="email" value={user?.email || ''} className="input" readOnly />
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Property Assignment
                </h3>
              </div>
              <div className="card-body">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <Building2 className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="font-medium">{user?.property?.name || 'All Properties (Admin)'}</p>
                    <p className="text-sm text-gray-500">Role: {user?.role}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Security
                </h3>
              </div>
              <div className="card-body">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium">Password</p>
                      <p className="text-sm text-gray-500">Last changed: Never</p>
                    </div>
                  </div>
                  <button className="btn-secondary" disabled>Change Password</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4" /> Notification Preferences
              </h3>
            </div>
            <div className="card-body space-y-4">
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-gray-500">Receive alerts for new chargebacks</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
              </label>
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium">Due Date Reminders</p>
                  <p className="text-sm text-gray-500">Get reminded 3 days before deadlines</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
              </label>
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium">Case Resolution Alerts</p>
                  <p className="text-sm text-gray-500">Notify when cases are won or lost</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
              </label>
            </div>
          </div>
        )}

        {/* Defense Configuration Tab - Combined AI & Evidence */}
        {activeTab === 'defense' && user?.role === 'ADMIN' && (
          <div className="space-y-8">
            {/* Quick Actions Bar */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Defense Configuration</h2>
                  <p className="text-sm text-gray-600">Configure AI thresholds and evidence requirements</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={loadConfig} disabled={loading} className="btn-secondary">
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button onClick={saveAllSettings} disabled={saving} className="btn-primary">
                  {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save All Changes
                </button>
              </div>
            </div>

            {/* AI Thresholds Section */}
            <div className="card">
              <div className="card-header border-b-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Brain className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">AI Decision Thresholds</h3>
                    <p className="text-sm text-gray-500">Set confidence score ranges for automated recommendations</p>
                  </div>
                </div>
              </div>
              <div className="card-body pt-4">
                {/* Visual Threshold Bar */}
                <div className="mb-8">
                  <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                  <div className="relative h-12 rounded-xl overflow-hidden flex">
                    <div
                      className="bg-gradient-to-r from-red-400 to-red-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${aiThresholds.gatherMoreEvidence}%` }}
                    >
                      <span className="truncate px-1">Unlikely to Win</span>
                    </div>
                    <div
                      className="bg-gradient-to-r from-orange-400 to-orange-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${aiThresholds.reviewRecommended - aiThresholds.gatherMoreEvidence}%` }}
                    >
                      <span className="truncate px-1">Gather Evidence</span>
                    </div>
                    <div
                      className="bg-gradient-to-r from-yellow-400 to-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${aiThresholds.autoSubmit - aiThresholds.reviewRecommended}%` }}
                    >
                      <span className="truncate px-1">Review</span>
                    </div>
                    <div
                      className="bg-gradient-to-r from-green-400 to-green-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${100 - aiThresholds.autoSubmit}%` }}
                    >
                      <span className="truncate px-1">Auto-Submit</span>
                    </div>
                  </div>
                </div>

                {/* Threshold Sliders */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-green-600" />
                        <span className="font-medium text-gray-800">Auto-Submit</span>
                      </div>
                      <span className="text-2xl font-bold text-green-600">{aiThresholds.autoSubmit}%</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="100"
                      value={aiThresholds.autoSubmit}
                      onChange={(e) => setAiThresholds(prev => ({ ...prev, autoSubmit: parseInt(e.target.value) }))}
                      className="w-full h-3 bg-green-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                    />
                    <p className="mt-3 text-xs text-green-700">Cases above this score are auto-submitted for dispute</p>
                  </div>

                  <div className="p-5 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border border-yellow-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <CircleDot className="w-4 h-4 text-yellow-600" />
                        <span className="font-medium text-gray-800">Review Needed</span>
                      </div>
                      <span className="text-2xl font-bold text-yellow-600">{aiThresholds.reviewRecommended}%</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max={aiThresholds.autoSubmit - 5}
                      value={aiThresholds.reviewRecommended}
                      onChange={(e) => setAiThresholds(prev => ({ ...prev, reviewRecommended: parseInt(e.target.value) }))}
                      className="w-full h-3 bg-yellow-200 rounded-lg appearance-none cursor-pointer accent-yellow-600"
                    />
                    <p className="mt-3 text-xs text-yellow-700">Cases in this range need human review before submission</p>
                  </div>

                  <div className="p-5 bg-gradient-to-br from-orange-50 to-red-50 rounded-xl border border-orange-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-600" />
                        <span className="font-medium text-gray-800">Need Evidence</span>
                      </div>
                      <span className="text-2xl font-bold text-orange-600">{aiThresholds.gatherMoreEvidence}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max={aiThresholds.reviewRecommended - 5}
                      value={aiThresholds.gatherMoreEvidence}
                      onChange={(e) => setAiThresholds(prev => ({ ...prev, gatherMoreEvidence: parseInt(e.target.value) }))}
                      className="w-full h-3 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <p className="mt-3 text-xs text-orange-700">Cases below this need more evidence before deciding</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Evidence Requirements Section */}
            <div className="card">
              <div className="card-header border-b-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Evidence Requirements by Dispute Type</h3>
                    <p className="text-sm text-gray-500">Define which evidence is required or recommended for each type of chargeback</p>
                  </div>
                </div>
              </div>
              <div className="card-body pt-4">
                {/* Dispute Type Selector */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {Object.entries(evidencePackets).map(([key, packet]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedDisputeType(key)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                        selectedDisputeType === key
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {packet.name}
                    </button>
                  ))}
                </div>

                {/* Selected Dispute Type Configuration */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">
                        {evidencePackets[selectedDisputeType].name}
                      </h4>
                      <p className="text-sm text-gray-500">{evidencePackets[selectedDisputeType].description}</p>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span>
                        <span className="text-gray-600">Required</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        <span className="text-gray-600">Recommended</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-gray-300"></span>
                        <span className="text-gray-600">Not Needed</span>
                      </div>
                    </div>
                  </div>

                  {/* Evidence Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {evidenceTypes.map((evidence) => {
                      const isRequired = evidencePackets[selectedDisputeType].required.includes(evidence.id);
                      const isRecommended = evidencePackets[selectedDisputeType].recommended.includes(evidence.id);

                      return (
                        <div
                          key={evidence.id}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            isRequired
                              ? 'bg-red-50 border-red-300'
                              : isRecommended
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900">{evidence.label}</h5>
                              <p className="text-xs text-gray-500 mt-1">{evidence.description}</p>
                            </div>
                            <div className="flex gap-1 ml-3">
                              <button
                                onClick={() => toggleEvidenceType(selectedDisputeType, evidence.id, 'required')}
                                className={`p-2 rounded-lg transition-colors ${
                                  isRequired
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500'
                                }`}
                                title="Mark as Required"
                              >
                                <AlertCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleEvidenceType(selectedDisputeType, evidence.id, 'recommended')}
                                className={`p-2 rounded-lg transition-colors ${
                                  isRecommended
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-500'
                                }`}
                                title="Mark as Recommended"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary */}
                  <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
                    <h5 className="font-medium text-gray-800 mb-3">Evidence Summary for {evidencePackets[selectedDisputeType].name}</h5>
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Required</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {evidencePackets[selectedDisputeType].required.length > 0 ? (
                            evidencePackets[selectedDisputeType].required.map(id => (
                              <span key={id} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                {evidenceTypes.find(e => e.id === id)?.label || id}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">None selected</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Recommended</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {evidencePackets[selectedDisputeType].recommended.length > 0 ? (
                            evidencePackets[selectedDisputeType].recommended.map(id => (
                              <span key={id} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                {evidenceTypes.find(e => e.id === id)?.label || id}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">None selected</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Evidence Weights Section */}
            <div className="card">
              <div className="card-header border-b-0 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Sliders className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Evidence Scoring Weights</h3>
                      <p className="text-sm text-gray-500">Adjust how much each evidence type contributes to the confidence score</p>
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-full font-medium ${
                    totalWeight === 100
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    Total: {totalWeight}% {totalWeight === 100 ? <Check className="w-4 h-4 inline ml-1" /> : null}
                  </div>
                </div>
              </div>
              <div className="card-body pt-4">
                {totalWeight !== 100 && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Weights must total 100%. Adjust the sliders to balance the scores.
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(evidenceWeights).map(([type, weight]) => {
                    const evidence = evidenceTypes.find(e => e.id === type);
                    return (
                      <div key={type} className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-gray-700 truncate" title={evidence?.label || type}>
                            {(evidence?.label || type).replace(/_/g, ' ')}
                          </label>
                          <span className="text-lg font-bold text-indigo-600 ml-2">{weight}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={weight}
                          onChange={(e) => setEvidenceWeights(prev => ({ ...prev, [type]: parseInt(e.target.value) }))}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email Settings Tab */}
        {activeTab === 'email' && user?.role === 'ADMIN' && (
          <div className="space-y-6">
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <Mail className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Email Notification Settings</h3>
                    <p className="text-sm text-gray-500">Configure who receives notifications and when</p>
                  </div>
                </div>
              </div>
              <div className="card-body space-y-6">
                <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailSettings.enabled}
                    onChange={(e) => setEmailSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <p className="font-medium">Enable Email Notifications</p>
                    <p className="text-sm text-gray-500">Send automated emails for chargeback events</p>
                  </div>
                </label>

                <div>
                  <label className="label">Email Recipients</label>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="input flex-1"
                        onKeyPress={(e) => e.key === 'Enter' && addEmailRecipient()}
                      />
                      <button onClick={addEmailRecipient} className="btn-primary">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {emailSettings.recipients.map((email) => (
                        <span
                          key={email}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm"
                        >
                          <Mail className="w-3 h-3" />
                          {email}
                          <button
                            onClick={() => removeEmailRecipient(email)}
                            className="hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="label">Notification Types</label>

                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">New Chargeback Alerts</p>
                      <p className="text-xs text-gray-500">Notify when new chargebacks are received</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={emailSettings.newCaseAlert}
                      onChange={(e) => setEmailSettings(prev => ({ ...prev, newCaseAlert: e.target.checked }))}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                    <div className="flex-1">
                      <p className="font-medium text-sm">Due Date Reminders</p>
                      <p className="text-xs text-gray-500">Send reminder before response deadline</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={emailSettings.dueDateReminderDays}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, dueDateReminderDays: parseInt(e.target.value) }))}
                        className="input py-1 text-sm w-20"
                      >
                        <option value={1}>1 day</option>
                        <option value={2}>2 days</option>
                        <option value={3}>3 days</option>
                        <option value={5}>5 days</option>
                        <option value={7}>7 days</option>
                      </select>
                      <input
                        type="checkbox"
                        checked={emailSettings.dueDateReminder}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, dueDateReminder: e.target.checked }))}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                    </div>
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">Case Resolution Notifications</p>
                      <p className="text-xs text-gray-500">Notify when cases are won or lost</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={emailSettings.caseResolution}
                      onChange={(e) => setEmailSettings(prev => ({ ...prev, caseResolution: e.target.checked }))}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                    <div className="flex-1">
                      <p className="font-medium text-sm">Weekly Summary Digest</p>
                      <p className="text-xs text-gray-500">Send weekly analytics report</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={emailSettings.digestDay}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, digestDay: e.target.value }))}
                        className="input py-1 text-sm w-28"
                      >
                        <option value="monday">Monday</option>
                        <option value="tuesday">Tuesday</option>
                        <option value="wednesday">Wednesday</option>
                        <option value="thursday">Thursday</option>
                        <option value="friday">Friday</option>
                      </select>
                      <input
                        type="checkbox"
                        checked={emailSettings.weeklyDigest}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, weeklyDigest: e.target.checked }))}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                    </div>
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">CC Property Managers</p>
                      <p className="text-xs text-gray-500">Include property managers on relevant notifications</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={emailSettings.ccManagers}
                      onChange={(e) => setEmailSettings(prev => ({ ...prev, ccManagers: e.target.checked }))}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                  </label>
                </div>

                <div className="pt-4 border-t">
                  <button
                    onClick={() => saveConfig('email_settings', emailSettings, 'Email settings')}
                    disabled={saving}
                    className="btn-primary"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Email Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Storage Settings Tab */}
        {activeTab === 'storage' && user?.role === 'ADMIN' && (
          <div className="space-y-6">
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-100 rounded-lg">
                    <Cloud className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Evidence Storage Configuration</h3>
                    <p className="text-sm text-gray-500">Configure where evidence files are stored</p>
                  </div>
                </div>
              </div>
              <div className="card-body space-y-6">
                {/* Storage Type Selection */}
                <div>
                  <label className="label">Storage Provider</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      storageConfig.type === 's3' ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="storageType"
                        value="s3"
                        checked={storageConfig.type === 's3'}
                        onChange={() => setStorageConfig(prev => ({ ...prev, type: 's3' }))}
                        className="sr-only"
                      />
                      <div className={`p-3 rounded-lg ${storageConfig.type === 's3' ? 'bg-cyan-500 text-white' : 'bg-gray-100'}`}>
                        <Cloud className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Amazon S3</p>
                        <p className="text-sm text-gray-500">Scalable cloud storage</p>
                      </div>
                      {storageConfig.type === 's3' && (
                        <Check className="w-5 h-5 text-cyan-500 ml-auto" />
                      )}
                    </label>

                    <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      storageConfig.type === 'local' ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="storageType"
                        value="local"
                        checked={storageConfig.type === 'local'}
                        onChange={() => setStorageConfig(prev => ({ ...prev, type: 'local' }))}
                        className="sr-only"
                      />
                      <div className={`p-3 rounded-lg ${storageConfig.type === 'local' ? 'bg-cyan-500 text-white' : 'bg-gray-100'}`}>
                        <HardDrive className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Local Storage</p>
                        <p className="text-sm text-gray-500">Store on server (dev only)</p>
                      </div>
                      {storageConfig.type === 'local' && (
                        <Check className="w-5 h-5 text-cyan-500 ml-auto" />
                      )}
                    </label>
                  </div>
                </div>

                {/* S3 Configuration */}
                {storageConfig.type === 's3' && (
                  <div className="space-y-4 p-6 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        AWS S3 Configuration
                      </h4>
                      <a
                        href="https://console.aws.amazon.com/s3"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                      >
                        Open AWS Console <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">S3 Bucket Name</label>
                        <input
                          type="text"
                          value={storageConfig.s3.bucket}
                          onChange={(e) => setStorageConfig(prev => ({
                            ...prev,
                            s3: { ...prev.s3, bucket: e.target.value }
                          }))}
                          placeholder="accudefend-evidence"
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">AWS Region</label>
                        <select
                          value={storageConfig.s3.region}
                          onChange={(e) => setStorageConfig(prev => ({
                            ...prev,
                            s3: { ...prev.s3, region: e.target.value }
                          }))}
                          className="input"
                        >
                          <option value="us-east-1">US East (N. Virginia)</option>
                          <option value="us-east-2">US East (Ohio)</option>
                          <option value="us-west-1">US West (N. California)</option>
                          <option value="us-west-2">US West (Oregon)</option>
                          <option value="eu-west-1">EU (Ireland)</option>
                          <option value="eu-west-2">EU (London)</option>
                          <option value="eu-central-1">EU (Frankfurt)</option>
                          <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                          <option value="ap-southeast-2">Asia Pacific (Sydney)</option>
                          <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-800">AWS Credentials</p>
                          <p className="text-sm text-amber-700 mt-1">
                            For security, AWS credentials are configured via environment variables on the server.
                            Update these in your <code className="bg-amber-100 px-1 rounded">.env</code> file:
                          </p>
                          <div className="mt-3 p-3 bg-white rounded-lg font-mono text-xs text-gray-600">
                            <p>AWS_ACCESS_KEY_ID=your_access_key</p>
                            <p>AWS_SECRET_ACCESS_KEY=your_secret_key</p>
                            <p>AWS_S3_BUCKET={storageConfig.s3.bucket || 'your_bucket_name'}</p>
                            <p>AWS_REGION={storageConfig.s3.region}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-4">
                      <button
                        onClick={testStorageConnection}
                        disabled={saving}
                        className="btn-secondary"
                      >
                        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Link className="w-4 h-4 mr-2" />}
                        Test Connection
                      </button>
                      {storageStatus && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                          storageStatus.connected
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {storageStatus.connected ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Connected
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4" />
                              {storageStatus.error || 'Connection Failed'}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Local Storage Info */}
                {storageConfig.type === 'local' && (
                  <div className="p-6 bg-gray-50 rounded-xl">
                    <div className="flex items-start gap-3">
                      <HardDrive className="w-5 h-5 text-gray-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-800">Local File Storage</p>
                        <p className="text-sm text-gray-600 mt-1">
                          Files will be stored on the server's local filesystem at:
                        </p>
                        <code className="block mt-2 p-2 bg-white rounded text-sm font-mono text-gray-600">
                          /backend/uploads/
                        </code>
                        <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Not recommended for production use
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Setup Guide */}
                <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                  <h4 className="font-semibold text-gray-800 mb-3">📚 Quick Setup Guide</h4>
                  <ol className="space-y-2 text-sm text-gray-700">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <span>Create an S3 bucket in your AWS Console</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <span>Create an IAM user with <code className="bg-white px-1 rounded">AmazonS3FullAccess</code> policy</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                      <span>Add the credentials to your <code className="bg-white px-1 rounded">.env</code> file</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                      <span>Restart the backend server and test the connection</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-sm text-gray-400 py-4">
        AccuDefend - AI-Powered Chargeback Defense Platform v1.0.0
      </div>
    </div>
  );
}
