/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Reservation Detail Viewer Component
 *
 * Used inline on the Reservations page (compact mode) or within CaseDetail.
 * Props:
 *   - reservationId: ID of the reservation to fetch
 *   - onClose: callback to close/collapse the viewer
 *   - compact: boolean, if true renders in a condensed layout
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Star,
  AlertTriangle,
  CalendarDays,
  BedDouble,
  Users,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  Link2,
  RefreshCw,
  X,
  ChevronRight,
  Building2,
  Shield,
  Hash,
  Clock
} from 'lucide-react';
import { api, formatCurrency, formatDate, formatDateTime } from '../utils/api';
import GuestFolioViewer from './GuestFolioViewer';

export default function ReservationViewer({ reservationId, onClose, compact = false }) {
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFolio, setShowFolio] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const fetchReservation = async () => {
    if (!reservationId) return;
    setLoading(true);
    try {
      const response = await api.get(`/reservations/${reservationId}`);
      setReservation(response.data.reservation || response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservation();
  }, [reservationId]);

  if (loading) {
    return (
      <div className={`${compact ? 'py-6' : 'card card-body py-12'} text-center`}>
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
        <p className="mt-2 text-sm text-gray-500">Loading reservation details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${compact ? 'py-6' : 'card card-body py-12'} text-center`}>
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="mt-2 text-red-600 font-medium">Failed to load reservation</p>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <button onClick={fetchReservation} className="btn-primary mt-3 text-sm">
          <RefreshCw className="w-4 h-4 mr-1" />
          Retry
        </button>
      </div>
    );
  }

  if (!reservation) return null;

  const res = reservation;

  return (
    <div className={compact ? '' : 'card'}>
      {/* Header */}
      <div className={`flex items-center justify-between ${compact ? 'mb-4' : 'card-header'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <CalendarDays className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              Reservation {res.confirmationNumber}
            </h3>
            <p className="text-sm text-gray-500">
              {res.guestName} &middot; {res.pmsSource?.replace(/_/g, ' ') || 'PMS'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!showFolio && (
            <button
              onClick={() => setShowFolio(true)}
              className="btn-secondary text-sm"
            >
              <FileText className="w-4 h-4 mr-1" />
              View Full Folio
            </button>
          )}
          {!res.linkedCase && (
            <button
              onClick={() => setShowLinkModal(true)}
              className="btn-secondary text-sm"
            >
              <Link2 className="w-4 h-4 mr-1" />
              Link to Case
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Flagged Guest Warning */}
      {res.isFlagged && (
        <div className={`${compact ? 'mb-4' : 'mx-6 mb-4'} flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg`}>
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-800">Flagged Guest</p>
            <p className="text-xs text-orange-600">
              This guest has been flagged for previous chargeback activity or suspicious behavior.
            </p>
          </div>
        </div>
      )}

      {/* Detail Cards Grid */}
      <div className={`${compact ? '' : 'card-body'} grid grid-cols-1 md:grid-cols-2 ${compact ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        {/* Guest Info Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Guest Information
          </h4>
          <div className="space-y-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">{res.guestName}</p>
            </div>
            {res.guestEmail && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{res.guestEmail}</span>
              </div>
            )}
            {res.guestPhone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span>{res.guestPhone}</span>
              </div>
            )}
            {res.loyaltyNumber && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span>Loyalty: {res.loyaltyNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stay Details Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <BedDouble className="w-3.5 h-3.5" />
            Stay Details
          </h4>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500">Check-in (Planned)</p>
                <p className="text-sm font-medium">{res.checkInDate ? formatDate(res.checkInDate) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Check-out (Planned)</p>
                <p className="text-sm font-medium">{res.checkOutDate ? formatDate(res.checkOutDate) : '—'}</p>
              </div>
            </div>
            {(res.actualCheckIn || res.actualCheckOut) && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                <div>
                  <p className="text-xs text-gray-500">Actual Check-in</p>
                  <p className="text-sm font-medium">
                    {res.actualCheckIn ? formatDateTime(res.actualCheckIn) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Actual Check-out</p>
                  <p className="text-sm font-medium">
                    {res.actualCheckOut ? formatDateTime(res.actualCheckOut) : '—'}
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500">Room #</p>
                <p className="text-sm font-medium">{res.roomNumber || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Room Type</p>
                <p className="text-sm font-medium">{res.roomType || '—'}</p>
              </div>
            </div>
            {(res.adults != null || res.children != null) && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  {res.adults || 0} Adult{(res.adults || 0) !== 1 ? 's' : ''}
                  {res.children > 0 && `, ${res.children} Child${res.children !== 1 ? 'ren' : ''}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Rate Info Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            Rate Information
          </h4>
          <div className="space-y-2.5">
            {res.rateCode && (
              <div>
                <p className="text-xs text-gray-500">Rate Code</p>
                <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono font-medium">
                  {res.rateCode}
                </span>
              </div>
            )}
            {res.rateAmount != null && (
              <div>
                <p className="text-xs text-gray-500">Nightly Rate</p>
                <p className="text-sm font-medium">{formatCurrency(res.rateAmount)}</p>
              </div>
            )}
            {res.bookingSource && (
              <div>
                <p className="text-xs text-gray-500">Booking Source</p>
                <p className="text-sm font-medium">{res.bookingSource}</p>
              </div>
            )}
            {res.totalAmount != null && (
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">Total Amount</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatCurrency(res.totalAmount)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Info Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" />
            Payment Information
          </h4>
          <div className="space-y-2.5">
            {res.cardBrand && (
              <div>
                <p className="text-xs text-gray-500">Card Brand</p>
                <p className="text-sm font-medium">{res.cardBrand}</p>
              </div>
            )}
            {res.cardLastFour && (
              <div>
                <p className="text-xs text-gray-500">Card Number</p>
                <p className="text-sm font-medium font-mono">
                  **** **** **** {res.cardLastFour}
                </p>
              </div>
            )}
            {res.paymentMethod && (
              <div>
                <p className="text-xs text-gray-500">Payment Method</p>
                <p className="text-sm font-medium">{res.paymentMethod.replace(/_/g, ' ')}</p>
              </div>
            )}
            {!res.cardBrand && !res.cardLastFour && !res.paymentMethod && (
              <p className="text-sm text-gray-400 italic">No payment data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Linked Chargebacks */}
      {res.linkedChargebacks && res.linkedChargebacks.length > 0 && (
        <div className={compact ? 'mt-4' : 'mx-6 mb-6 mt-4'}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Linked Chargebacks ({res.linkedChargebacks.length})
          </h4>
          <div className="space-y-2">
            {res.linkedChargebacks.map((cb) => (
              <Link
                key={cb.id}
                to={`/cases/${cb.id}`}
                className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-red-100 rounded">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{cb.caseNumber}</p>
                    <p className="text-xs text-gray-500">
                      {cb.status?.replace(/_/g, ' ')} &middot; {cb.reasonCode || 'No reason code'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-red-700">
                    {formatCurrency(cb.amount)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Folio Summary */}
      {res.folioSummary && (
        <div className={compact ? 'mt-4' : 'mx-6 mb-6 mt-4'}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Folio Summary
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-blue-600 font-medium">Total Charges</p>
              <p className="text-lg font-bold text-blue-900">
                {formatCurrency(res.folioSummary.totalCharges || 0)}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-green-600 font-medium">Total Payments</p>
              <p className="text-lg font-bold text-green-900">
                {formatCurrency(res.folioSummary.totalPayments || 0)}
              </p>
            </div>
            <div className={`rounded-lg p-3 text-center ${
              (res.folioSummary.balance || 0) > 0 ? 'bg-red-50' : 'bg-gray-50'
            }`}>
              <p className={`text-xs font-medium ${
                (res.folioSummary.balance || 0) > 0 ? 'text-red-600' : 'text-gray-600'
              }`}>
                Balance
              </p>
              <p className={`text-lg font-bold ${
                (res.folioSummary.balance || 0) > 0 ? 'text-red-900' : 'text-gray-900'
              }`}>
                {formatCurrency(res.folioSummary.balance || 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full Folio Viewer (expanded) */}
      {showFolio && (
        <div className={compact ? 'mt-4' : 'mx-6 mb-6 mt-4'}>
          <GuestFolioViewer
            reservationId={reservationId}
            onClose={() => setShowFolio(false)}
          />
        </div>
      )}

      {/* Link to Case Modal */}
      {showLinkModal && (
        <LinkToCaseModal
          reservationId={reservationId}
          onClose={() => setShowLinkModal(false)}
          onLinked={() => {
            setShowLinkModal(false);
            fetchReservation();
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal for linking a reservation to an existing chargeback case.
 */
function LinkToCaseModal({ reservationId, onClose, onLinked }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCases = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.set('search', searchTerm);
        params.set('limit', '20');
        const response = await api.get(`/cases?${params}`);
        setCases(response.data.cases || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCases();
  }, [searchTerm]);

  const handleLink = async (caseId) => {
    setLinking(true);
    try {
      await api.post(`/reservations/${reservationId}/link`, { caseId });
      onLinked();
    } catch (err) {
      setError(err.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Link to Chargeback Case</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search cases by number or guest name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm text-gray-500 mt-2">Searching cases...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No cases found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleLink(c.id)}
                  disabled={linking}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.caseNumber}</p>
                    <p className="text-xs text-gray-500">
                      {c.guestName} &middot; {c.status?.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(c.amount)}</p>
                    <p className="text-xs text-gray-400">{c.reasonCode}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary w-full">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
