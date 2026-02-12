/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Case Detail Page
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  FileText,
  Upload,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  Trash2,
  Brain,
  Building2,
  CreditCard,
  Calendar,
  User,
  Mail,
  Phone
} from 'lucide-react';
import { api, formatCurrency, formatDate, formatDateTime, getStatusColor } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

export default function CaseDetail() {
  const { id } = useParams();
  const { isManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [analyzing, setAnalyzing] = useState(false);

  const fetchCase = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/cases/${id}`);
      setCaseData(response.data.chargeback);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCase();
  }, [id]);

  const handleReanalyze = async () => {
    setAnalyzing(true);
    try {
      await api.post(`/cases/${id}/analyze`);
      await fetchCase();
    } catch (err) {
      alert(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-omni-600 animate-spin" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="card card-body text-center py-12">
        <XCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="mt-4 text-lg font-semibold">Case Not Found</h2>
        <p className="text-gray-500 mt-2">{error || 'Unable to load case details'}</p>
        <Link to="/cases" className="btn-primary mt-4">
          Back to Cases
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'evidence', label: 'Evidence', icon: Upload, count: caseData.evidence?.length },
    { id: 'timeline', label: 'Timeline', icon: Clock, count: caseData.timeline?.length },
    { id: 'notes', label: 'Notes', icon: MessageSquare, count: caseData.notes?.length }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/cases" className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{caseData.caseNumber}</h1>
              <span className={`badge ${getStatusColor(caseData.status)}`}>
                {caseData.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-gray-500">{caseData.guestName} - {formatCurrency(caseData.amount)}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReanalyze}
            disabled={analyzing}
            className="btn-secondary"
          >
            <Brain className={`w-4 h-4 mr-2 ${analyzing ? 'animate-pulse' : ''}`} />
            {analyzing ? 'Analyzing...' : 'Re-analyze'}
          </button>
          {isManager && caseData.status === 'IN_REVIEW' && (
            <button className="btn-primary">
              Submit Dispute
            </button>
          )}
        </div>
      </div>

      {/* AI Confidence Banner */}
      {caseData.confidenceScore !== null && (
        <div className={`card card-body ${
          caseData.confidenceScore >= 70 ? 'bg-green-50 border-green-200' :
          caseData.confidenceScore >= 50 ? 'bg-yellow-50 border-yellow-200' :
          'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${
                caseData.confidenceScore >= 70 ? 'bg-green-100' :
                caseData.confidenceScore >= 50 ? 'bg-yellow-100' : 'bg-red-100'
              }`}>
                <Brain className={`w-6 h-6 ${
                  caseData.confidenceScore >= 70 ? 'text-green-600' :
                  caseData.confidenceScore >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  AI Confidence Score: {caseData.confidenceScore}%
                </p>
                <p className="text-sm text-gray-600">
                  Recommendation: {caseData.recommendation?.replace(/_/g, ' ') || 'Pending Analysis'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="w-32 h-3 bg-gray-200 rounded-full">
                <div
                  className={`h-full rounded-full ${
                    caseData.confidenceScore >= 70 ? 'bg-green-500' :
                    caseData.confidenceScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${caseData.confidenceScore}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-omni-600 text-omni-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Guest Info */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="w-4 h-4" /> Guest Information
              </h3>
            </div>
            <div className="card-body space-y-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium">{caseData.guestName}</p>
              </div>
              {caseData.guestEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <p className="text-sm">{caseData.guestEmail}</p>
                </div>
              )}
              {caseData.guestPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <p className="text-sm">{caseData.guestPhone}</p>
                </div>
              )}
            </div>
          </div>

          {/* Stay Details */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Stay Details
              </h3>
            </div>
            <div className="card-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Check-in</p>
                  <p className="font-medium">{formatDate(caseData.checkInDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Check-out</p>
                  <p className="font-medium">{formatDate(caseData.checkOutDate)}</p>
                </div>
              </div>
              {caseData.roomNumber && (
                <div>
                  <p className="text-sm text-gray-500">Room</p>
                  <p className="font-medium">{caseData.roomNumber} {caseData.roomType && `(${caseData.roomType})`}</p>
                </div>
              )}
              {caseData.confirmationNumber && (
                <div>
                  <p className="text-sm text-gray-500">Confirmation #</p>
                  <p className="font-medium">{caseData.confirmationNumber}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Property</p>
                <p className="font-medium">{caseData.property?.name}</p>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Transaction Details
              </h3>
            </div>
            <div className="card-body space-y-4">
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(caseData.amount, caseData.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Transaction ID</p>
                <p className="font-mono text-sm">{caseData.transactionId}</p>
              </div>
              {caseData.cardLastFour && (
                <div>
                  <p className="text-sm text-gray-500">Card</p>
                  <p className="font-medium">
                    {caseData.cardBrand} ****{caseData.cardLastFour}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Processor</p>
                <p className="font-medium">{caseData.provider?.name}</p>
              </div>
            </div>
          </div>

          {/* Dispute Details */}
          <div className="card lg:col-span-2">
            <div className="card-header">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Dispute Details
              </h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Reason Code</p>
                  <p className="font-medium">{caseData.reasonCode}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Description</p>
                  <p className="font-medium">{caseData.reasonDescription || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Dispute Date</p>
                  <p className="font-medium">{formatDate(caseData.disputeDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className={`font-medium ${
                    caseData.dueDate && new Date(caseData.dueDate) < new Date()
                      ? 'text-red-600'
                      : ''
                  }`}>
                    {caseData.dueDate ? formatDate(caseData.dueDate) : '-'}
                  </p>
                </div>
                {caseData.processorDisputeId && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Processor Dispute ID</p>
                    <p className="font-mono text-sm">{caseData.processorDisputeId}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fraud Indicators */}
          {caseData.fraudIndicators && (
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold">Fraud Indicators</h3>
              </div>
              <div className="card-body space-y-4">
                {caseData.fraudIndicators.positive?.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Positive</p>
                    <div className="flex flex-wrap gap-2">
                      {caseData.fraudIndicators.positive.map((i) => (
                        <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                          {i.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {caseData.fraudIndicators.negative?.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Negative</p>
                    <div className="flex flex-wrap gap-2">
                      {caseData.fraudIndicators.negative.map((i) => (
                        <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                          {i.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'evidence' && (
        <EvidenceTab caseId={id} evidence={caseData.evidence} onUpdate={fetchCase} />
      )}

      {activeTab === 'timeline' && (
        <TimelineTab timeline={caseData.timeline} />
      )}

      {activeTab === 'notes' && (
        <NotesTab caseId={id} notes={caseData.notes} onUpdate={fetchCase} />
      )}
    </div>
  );
}

// Evidence Tab Component with Photo Upload
function EvidenceTab({ caseId, evidence, onUpdate }) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const evidenceTypeOptions = [
    { value: 'ID_SCAN', label: 'ID Scan', icon: '🪪' },
    { value: 'AUTH_SIGNATURE', label: 'Authorization Signature', icon: '✍️' },
    { value: 'CHECKOUT_SIGNATURE', label: 'Checkout Signature', icon: '📝' },
    { value: 'FOLIO', label: 'Folio/Invoice', icon: '🧾' },
    { value: 'RESERVATION_CONFIRMATION', label: 'Reservation Confirmation', icon: '📧' },
    { value: 'CANCELLATION_POLICY', label: 'Cancellation Policy', icon: '📋' },
    { value: 'CANCELLATION_POLICY_VIOLATION', label: 'Policy Violation Documentation', icon: '⚠️' },
    { value: 'KEY_CARD_LOG', label: 'Key Card Log', icon: '🔑' },
    { value: 'CCTV_FOOTAGE', label: 'CCTV Footage', icon: '📹' },
    { value: 'CORRESPONDENCE', label: 'Correspondence', icon: '💬' },
    { value: 'INCIDENT_REPORT', label: 'Incident Report', icon: '📄' },
    { value: 'DAMAGE_PHOTOS', label: 'Damage Photos', icon: '📷' },
    { value: 'DAMAGE_ASSESSMENT', label: 'Damage Assessment', icon: '📊' },
    { value: 'POLICE_REPORT', label: 'Police Report', icon: '👮' },
    { value: 'NO_SHOW_DOCUMENTATION', label: 'No Show Documentation', icon: '🚫' },
    { value: 'OTHER', label: 'Other Documents', icon: '📎' }
  ];

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = (files) => {
    const fileArray = Array.from(files);
    setSelectedFiles(prev => [...prev, ...fileArray]);
  };

  const handleFileInput = (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!uploadType || selectedFiles.length === 0) return;

    setUploading(true);
    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', uploadType);
        formData.append('description', description);

        await api.upload(`/evidence/${caseId}/upload`, formData);
      }

      setShowUploadModal(false);
      setSelectedFiles([]);
      setUploadType('');
      setDescription('');
      onUpdate();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const isImageFile = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  };

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="font-semibold">Evidence Files</h3>
        <button
          className="btn-primary"
          onClick={() => setShowUploadModal(true)}
        >
          <Upload className="w-4 h-4 mr-2" /> Upload Evidence
        </button>
      </div>
      <div className="card-body">
        {evidence?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {evidence.map((e) => (
              <div key={e.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {isImageFile(e.fileName) ? (
                      <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                        <img
                          src={e.downloadUrl}
                          alt={e.fileName}
                          className="w-full h-full object-cover"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      </div>
                    ) : (
                      <FileText className="w-8 h-8 text-gray-400" />
                    )}
                    <div>
                      <p className="font-medium text-sm truncate max-w-[150px]">{e.fileName}</p>
                      <p className="text-xs text-gray-500">{e.type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  {e.verified && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <a href={e.downloadUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs py-1">
                    <Download className="w-3 h-3 mr-1" /> Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No evidence uploaded yet</p>
            <p className="text-sm mt-1">Upload ID scans, folios, signatures, photos, and more</p>
            <button
              className="btn-primary mt-4"
              onClick={() => setShowUploadModal(true)}
            >
              <Upload className="w-4 h-4 mr-2" /> Upload First Evidence
            </button>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Upload Evidence</h2>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Evidence Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Evidence Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select evidence type...</option>
                  {evidenceTypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Drag & Drop Zone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Files <span className="text-red-500">*</span>
                </label>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 mb-2">
                    Drag and drop files here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400 mb-4">
                    Supports: JPG, PNG, PDF, DOCX, TXT (Max 10MB per file)
                  </p>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="btn-secondary cursor-pointer"
                  >
                    Browse Files
                  </label>
                </div>
              </div>

              {/* Selected Files Preview */}
              {selectedFiles.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selected Files ({selectedFiles.length})
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                      >
                        <div className="flex items-center gap-3">
                          {file.type.startsWith('image/') ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <FileText className="w-10 h-10 text-gray-400" />
                          )}
                          <div>
                            <p className="text-sm font-medium truncate max-w-[200px]">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add any notes about this evidence..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadType || selectedFiles.length === 0 || uploading}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Timeline Tab Component
function TimelineTab({ timeline }) {
  const getEventIcon = (type) => {
    const icons = {
      ALERT: AlertTriangle,
      SUCCESS: CheckCircle,
      ERROR: XCircle,
      WON: CheckCircle,
      LOST: XCircle,
      AI: Brain,
      default: Clock
    };
    return icons[type] || icons.default;
  };

  const getEventColor = (type) => {
    const colors = {
      ALERT: 'bg-yellow-100 text-yellow-600',
      SUCCESS: 'bg-green-100 text-green-600',
      ERROR: 'bg-red-100 text-red-600',
      WON: 'bg-green-100 text-green-600',
      LOST: 'bg-red-100 text-red-600',
      AI: 'bg-purple-100 text-purple-600',
      default: 'bg-gray-100 text-gray-600'
    };
    return colors[type] || colors.default;
  };

  return (
    <div className="card card-body">
      {timeline?.length > 0 ? (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-6">
            {timeline.map((event, index) => {
              const Icon = getEventIcon(event.eventType);
              return (
                <div key={event.id} className="relative flex gap-4">
                  <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center ${getEventColor(event.eventType)}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 pt-2">
                    <p className="font-medium">{event.title}</p>
                    {event.description && (
                      <p className="text-sm text-gray-500 mt-1">{event.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No timeline events yet</p>
        </div>
      )}
    </div>
  );
}

// Notes Tab Component
function NotesTab({ caseId, notes, onUpdate }) {
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setSubmitting(true);
    try {
      await api.post(`/cases/${caseId}/notes`, { content: newNote });
      setNewNote('');
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-semibold">Case Notes</h3>
      </div>
      <div className="card-body">
        <form onSubmit={handleSubmit} className="mb-6">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={3}
            className="input"
          />
          <button
            type="submit"
            disabled={submitting || !newNote.trim()}
            className="btn-primary mt-2"
          >
            {submitting ? 'Adding...' : 'Add Note'}
          </button>
        </form>

        {notes?.length > 0 ? (
          <div className="space-y-4">
            {notes.map((note) => (
              <div key={note.id} className="border-l-4 border-omni-200 pl-4 py-2">
                <p className="text-sm">{note.content}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {note.user?.firstName} {note.user?.lastName} - {formatDateTime(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No notes yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
