/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Reservations List Page
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarCheck,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Building2,
  CreditCard,
  User,
  X,
  ChevronUp,
  ChevronDown,
  Link2,
  CalendarDays,
  Hash,
  BedDouble,
  DollarSign,
  Clock,
  Flag
} from 'lucide-react';
import { api, formatCurrency, formatDate, formatDateTime } from '../utils/api';
import ReservationViewer from '../components/ReservationViewer';

const PMS_SOURCE_OPTIONS = [
  { value: '', label: 'All PMS Sources' },
  { value: 'OPERA_CLOUD', label: 'Opera Cloud' },
  { value: 'MEWS', label: 'Mews' },
  { value: 'CLOUDBEDS', label: 'Cloudbeds' },
  { value: 'AUTOCLERK', label: 'AutoClerk' }
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'checked_out', label: 'Checked Out' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' }
];

const LINK_FILTER_OPTIONS = [
  { value: '', label: 'All Reservations' },
  { value: 'linked', label: 'Linked to Chargeback' },
  { value: 'unlinked', label: 'Not Linked' }
];

function getReservationStatusBadge(status) {
  const styles = {
    confirmed: 'bg-gray-100 text-gray-700',
    checked_in: 'bg-blue-100 text-blue-700',
    checked_out: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    no_show: 'bg-orange-100 text-orange-700'
  };
  return styles[status] || 'bg-gray-100 text-gray-700';
}

function formatStatusLabel(status) {
  if (!status) return '—';
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function Reservations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reservations, setReservations] = useState([]);
  const [pagination, setPagination] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState(searchParams.get('sortField') || 'checkInDate');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc');

  // Filter state
  const [filters, setFilters] = useState({
    confirmationNumber: searchParams.get('confirmationNumber') || '',
    guestName: searchParams.get('guestName') || '',
    cardLastFour: searchParams.get('cardLastFour') || '',
    checkInFrom: searchParams.get('checkInFrom') || '',
    checkInTo: searchParams.get('checkInTo') || '',
    pmsSource: searchParams.get('pmsSource') || '',
    status: searchParams.get('status') || '',
    linkFilter: searchParams.get('linkFilter') || '',
    page: parseInt(searchParams.get('page')) || 1,
    limit: 25
  });

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.confirmationNumber) params.set('confirmationNumber', filters.confirmationNumber);
      if (filters.guestName) params.set('guestName', filters.guestName);
      if (filters.cardLastFour) params.set('cardLastFour', filters.cardLastFour);
      if (filters.checkInFrom) params.set('checkInFrom', filters.checkInFrom);
      if (filters.checkInTo) params.set('checkInTo', filters.checkInTo);
      if (filters.pmsSource) params.set('pmsSource', filters.pmsSource);
      if (filters.status) params.set('status', filters.status);
      if (filters.linkFilter) params.set('linkFilter', filters.linkFilter);
      params.set('page', filters.page);
      params.set('limit', filters.limit);
      params.set('sortField', sortField);
      params.set('sortOrder', sortOrder);

      const response = await api.get(`/reservations?${params}`);
      setReservations(response.data.reservations || []);
      setPagination(response.data.pagination || {});
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, sortField, sortOrder]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await api.get('/reservations/stats/summary');
      setStats(response.data);
    } catch (err) {
      // Stats are non-critical; silently fail
      console.debug('Could not fetch reservation stats:', err.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
    // Sync URL params
    const params = new URLSearchParams();
    if (filters.confirmationNumber) params.set('confirmationNumber', filters.confirmationNumber);
    if (filters.guestName) params.set('guestName', filters.guestName);
    if (filters.cardLastFour) params.set('cardLastFour', filters.cardLastFour);
    if (filters.checkInFrom) params.set('checkInFrom', filters.checkInFrom);
    if (filters.checkInTo) params.set('checkInTo', filters.checkInTo);
    if (filters.pmsSource) params.set('pmsSource', filters.pmsSource);
    if (filters.status) params.set('status', filters.status);
    if (filters.linkFilter) params.set('linkFilter', filters.linkFilter);
    if (filters.page > 1) params.set('page', filters.page);
    if (sortField !== 'checkInDate') params.set('sortField', sortField);
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);
    setSearchParams(params);
  }, [filters, sortField, sortOrder]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setFilters((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
    setExpandedRow(null);
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({
      confirmationNumber: '',
      guestName: '',
      cardLastFour: '',
      checkInFrom: '',
      checkInTo: '',
      pmsSource: '',
      status: '',
      linkFilter: '',
      page: 1,
      limit: 25
    });
    setSortField('checkInDate');
    setSortOrder('desc');
  };

  const hasActiveFilters =
    filters.confirmationNumber ||
    filters.guestName ||
    filters.cardLastFour ||
    filters.checkInFrom ||
    filters.checkInTo ||
    filters.pmsSource ||
    filters.status ||
    filters.linkFilter;

  const handleRowClick = (reservationId) => {
    setExpandedRow(expandedRow === reservationId ? null : reservationId);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) {
      return <ChevronDown className="w-3 h-3 text-gray-300 ml-1" />;
    }
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-blue-600 ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 text-blue-600 ml-1" />
    );
  };

  const renderPageNumbers = () => {
    const totalPages = pagination.totalPages || 1;
    const currentPage = pagination.page || 1;
    const pages = [];
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (endPage - startPage < 4) {
      if (startPage === 1) {
        endPage = Math.min(totalPages, startPage + 4);
      } else {
        startPage = Math.max(1, endPage - 4);
      }
    }

    if (startPage > 1) {
      pages.push(
        <button
          key={1}
          onClick={() => handlePageChange(1)}
          className="px-3 py-1 text-sm rounded-md hover:bg-gray-100 text-gray-600"
        >
          1
        </button>
      );
      if (startPage > 2) {
        pages.push(
          <span key="dots-start" className="px-1 text-gray-400">
            ...
          </span>
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`px-3 py-1 text-sm rounded-md ${
            i === currentPage
              ? 'bg-blue-600 text-white font-medium'
              : 'hover:bg-gray-100 text-gray-600'
          }`}
        >
          {i}
        </button>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <span key="dots-end" className="px-1 text-gray-400">
            ...
          </span>
        );
      }
      pages.push(
        <button
          key={totalPages}
          onClick={() => handlePageChange(totalPages)}
          className="px-3 py-1 text-sm rounded-md hover:bg-gray-100 text-gray-600"
        >
          {totalPages}
        </button>
      );
    }

    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="w-7 h-7 text-blue-600" />
            Reservations
          </h1>
          <p className="text-gray-500 mt-1">
            PMS reservation data synced for chargeback defense
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              fetchReservations();
              fetchStats();
            }}
            className="btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card card-body">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Synced</p>
              {statsLoading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.totalReservations?.toLocaleString() ?? '—'}
                </p>
              )}
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <CalendarCheck className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Linked to Chargebacks</p>
              {statsLoading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.linkedToChargebacks?.toLocaleString() ?? '—'}
                </p>
              )}
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Link2 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Flagged Guests</p>
              {statsLoading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.flaggedGuests?.toLocaleString() ?? '—'}
                </p>
              )}
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="card card-body">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Last Sync</p>
              {statsLoading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-lg font-semibold text-gray-900">
                  {stats?.lastSyncTime ? formatDateTime(stats.lastSyncTime) : 'Never'}
                </p>
              )}
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search/Filter Bar */}
      <div className="card card-body">
        <div className="flex flex-col gap-4">
          {/* Top row: quick search + toggle */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by confirmation # or guest name..."
                value={filters.guestName || filters.confirmationNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  // If value looks like a number/confirmation, put in confirmation field
                  if (/^\d+$/.test(val)) {
                    setFilters((prev) => ({
                      ...prev,
                      confirmationNumber: val,
                      guestName: '',
                      page: 1
                    }));
                  } else {
                    setFilters((prev) => ({
                      ...prev,
                      guestName: val,
                      confirmationNumber: '',
                      page: 1
                    }));
                  }
                }}
                className="input pl-10"
              />
            </div>
            <div className="sm:w-48">
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="input"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary sm:w-auto ${
                hasActiveFilters ? 'border-blue-300 bg-blue-50 text-blue-700' : ''
              }`}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1.5 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  !
                </span>
              )}
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="border-t border-gray-200 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Confirmation #
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g. RES-12345"
                    value={filters.confirmationNumber}
                    onChange={(e) => handleFilterChange('confirmationNumber', e.target.value)}
                    className="input pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Guest Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={filters.guestName}
                    onChange={(e) => handleFilterChange('guestName', e.target.value)}
                    className="input pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Card Last 4
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="1234"
                    maxLength={4}
                    value={filters.cardLastFour}
                    onChange={(e) =>
                      handleFilterChange('cardLastFour', e.target.value.replace(/\D/g, ''))
                    }
                    className="input pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">PMS Source</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={filters.pmsSource}
                    onChange={(e) => handleFilterChange('pmsSource', e.target.value)}
                    className="input pl-9 text-sm"
                  >
                    {PMS_SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Check-in From
                </label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.checkInFrom}
                    onChange={(e) => handleFilterChange('checkInFrom', e.target.value)}
                    className="input pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Check-in To
                </label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.checkInTo}
                    onChange={(e) => handleFilterChange('checkInTo', e.target.value)}
                    className="input pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Chargeback Link
                </label>
                <select
                  value={filters.linkFilter}
                  onChange={(e) => handleFilterChange('linkFilter', e.target.value)}
                  className="input text-sm"
                >
                  {LINK_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="btn-secondary w-full text-sm"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear All Filters
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reservations Table */}
      <div className="card overflow-hidden">
        {loading && !reservations.length ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="mt-3 text-gray-500">Loading reservations...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="mt-3 text-red-600 font-medium">Failed to load reservations</p>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
            <button onClick={fetchReservations} className="btn-primary mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          </div>
        ) : reservations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CalendarCheck className="w-12 h-12 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No reservations found</h3>
            <p className="text-gray-500 mt-1 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your filters to find what you are looking for.'
                : 'Reservations will appear here once synced from your PMS integration.'}
            </p>
            {hasActiveFilters && (
              <button onClick={handleClearFilters} className="btn-secondary mt-4">
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort('confirmationNumber')}
                    >
                      <div className="flex items-center">
                        Confirmation #
                        <SortIcon field="confirmationNumber" />
                      </div>
                    </th>
                    <th
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort('guestName')}
                    >
                      <div className="flex items-center">
                        Guest
                        <SortIcon field="guestName" />
                      </div>
                    </th>
                    <th
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort('checkInDate')}
                    >
                      <div className="flex items-center">
                        Check-in
                        <SortIcon field="checkInDate" />
                      </div>
                    </th>
                    <th
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort('checkOutDate')}
                    >
                      <div className="flex items-center">
                        Check-out
                        <SortIcon field="checkOutDate" />
                      </div>
                    </th>
                    <th className="whitespace-nowrap">Room</th>
                    <th className="whitespace-nowrap">Rate</th>
                    <th
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort('totalAmount')}
                    >
                      <div className="flex items-center">
                        Amount
                        <SortIcon field="totalAmount" />
                      </div>
                    </th>
                    <th
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center">
                        Status
                        <SortIcon field="status" />
                      </div>
                    </th>
                    <th className="whitespace-nowrap">PMS Source</th>
                    <th className="whitespace-nowrap">Linked Case</th>
                    <th className="whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reservations.map((res) => (
                    <React.Fragment key={res.id}>
                      <tr
                        className={`cursor-pointer transition-colors ${
                          expandedRow === res.id
                            ? 'bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleRowClick(res.id)}
                      >
                        <td>
                          <span className="font-mono text-sm font-medium text-blue-600">
                            {res.confirmationNumber}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            {res.isFlagged && (
                              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" title="Flagged guest" />
                            )}
                            <div>
                              <p className="font-medium text-gray-900 whitespace-nowrap">
                                {res.guestName}
                              </p>
                              {res.guestEmail && (
                                <p className="text-xs text-gray-400 truncate max-w-[160px]">
                                  {res.guestEmail}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="text-sm text-gray-600 whitespace-nowrap">
                          {res.checkInDate ? formatDate(res.checkInDate) : '—'}
                        </td>
                        <td className="text-sm text-gray-600 whitespace-nowrap">
                          {res.checkOutDate ? formatDate(res.checkOutDate) : '—'}
                        </td>
                        <td>
                          <div className="text-sm">
                            <span className="font-medium">{res.roomNumber || '—'}</span>
                            {res.roomType && (
                              <p className="text-xs text-gray-400">{res.roomType}</p>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm">
                            {res.rateCode && (
                              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                {res.rateCode}
                              </span>
                            )}
                            {res.rateAmount != null && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {formatCurrency(res.rateAmount)}/nt
                              </p>
                            )}
                            {!res.rateCode && res.rateAmount == null && '—'}
                          </div>
                        </td>
                        <td className="font-medium text-gray-900 whitespace-nowrap">
                          {res.totalAmount != null ? formatCurrency(res.totalAmount) : '—'}
                        </td>
                        <td>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getReservationStatusBadge(
                              res.status
                            )}`}
                          >
                            {formatStatusLabel(res.status)}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {res.pmsSource
                              ? res.pmsSource.replace(/_/g, ' ')
                              : '—'}
                          </span>
                        </td>
                        <td>
                          {res.linkedCase ? (
                            <Link
                              to={`/cases/${res.linkedCase.id}`}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {res.linkedCase.caseNumber}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="p-2 rounded-lg hover:bg-gray-100 inline-flex"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(res.id);
                            }}
                            title="View details"
                          >
                            {expandedRow === res.id ? (
                              <ChevronUp className="w-4 h-4 text-blue-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row - Inline ReservationViewer */}
                      {expandedRow === res.id && (
                        <tr>
                          <td colSpan={11} className="p-0 bg-gray-50">
                            <div className="p-4 border-t-2 border-blue-200">
                              <ReservationViewer
                                reservationId={res.id}
                                onClose={() => setExpandedRow(null)}
                                compact
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {(pagination.totalPages || 1) > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-gray-200 gap-3">
                <p className="text-sm text-gray-500">
                  Showing{' '}
                  <span className="font-medium">
                    {((pagination.page - 1) * pagination.limit) + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">{pagination.total?.toLocaleString()}</span>{' '}
                  reservations
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  {renderPageNumbers()}
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
