/**
 * AccuDefend - Hotel Chargeback Defense System
 * Cases List Page
 */

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  Download,
  Eye
} from 'lucide-react';
import { api, formatCurrency, formatDate, getStatusColor } from '../utils/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
  { value: 'EXPIRED', label: 'Expired' }
];

export default function Cases() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cases, setCases] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state from URL params
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    page: parseInt(searchParams.get('page')) || 1,
    limit: 20
  });

  const fetchCases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      params.set('page', filters.page);
      params.set('limit', filters.limit);

      const response = await api.get(`/cases?${params}`);
      setCases(response.data.cases);
      setPagination(response.data.pagination);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
    // Update URL params
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.page > 1) params.set('page', filters.page);
    setSearchParams(params);
  }, [filters]);

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters({ ...filters, page: 1 });
  };

  const handlePageChange = (newPage) => {
    setFilters({ ...filters, page: newPage });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chargeback Cases</h1>
          <p className="text-gray-500">
            {pagination.total || 0} total cases
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <Link to="/cases/new" className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Case
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-body">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by case #, guest name, or email..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              className="input pl-10"
            />
          </div>
          <div className="sm:w-48">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              className="input"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary sm:w-auto">
            <Filter className="w-4 h-4 mr-2" />
            Apply
          </button>
        </form>
      </div>

      {/* Cases Table */}
      <div className="card overflow-hidden">
        {loading && !cases.length ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 text-omni-600 animate-spin mx-auto" />
            <p className="mt-2 text-gray-500">Loading cases...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={fetchCases} className="mt-4 btn-primary">
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Guest</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {cases.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          to={`/cases/${c.id}`}
                          className="text-omni-600 hover:text-omni-700 font-medium"
                        >
                          {c.caseNumber}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.provider?.name || 'Unknown'}
                        </p>
                      </td>
                      <td>
                        <p className="font-medium">{c.guestName}</p>
                        {c.guestEmail && (
                          <p className="text-xs text-gray-400">{c.guestEmail}</p>
                        )}
                      </td>
                      <td className="font-medium">
                        {formatCurrency(c.amount, c.currency)}
                      </td>
                      <td>
                        <span className="text-sm">{c.reasonCode}</span>
                        {c.reasonDescription && (
                          <p className="text-xs text-gray-400 truncate max-w-[150px]">
                            {c.reasonDescription}
                          </p>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getStatusColor(c.status)}`}>
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {c.confidenceScore !== null ? (
                          <div className="flex items-center">
                            <div className="w-16 h-2 bg-gray-200 rounded-full mr-2">
                              <div
                                className={`h-full rounded-full ${
                                  c.confidenceScore >= 70
                                    ? 'bg-green-500'
                                    : c.confidenceScore >= 50
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${c.confidenceScore}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{c.confidenceScore}%</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td>
                        {c.dueDate ? (
                          <span className={`text-sm ${
                            new Date(c.dueDate) < new Date()
                              ? 'text-red-600 font-medium'
                              : new Date(c.dueDate) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                              ? 'text-yellow-600'
                              : 'text-gray-600'
                          }`}>
                            {formatDate(c.dueDate)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td>
                        <Link
                          to={`/cases/${c.id}`}
                          className="p-2 rounded-lg hover:bg-gray-100 inline-flex"
                        >
                          <Eye className="w-4 h-4 text-gray-500" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {cases.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-500">
                        No cases found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} results
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
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
