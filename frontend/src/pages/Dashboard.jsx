/**
 * AccuDefend - Hotel Chargeback Defense System
 * Dashboard Page
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  FileText,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { api, formatCurrency, formatDate, getStatusColor } from '../utils/api';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/analytics/dashboard');
      setData(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="mt-2 text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
        <p className="mt-2 text-red-700">{error}</p>
        <button onClick={fetchData} className="mt-4 btn-primary">
          Retry
        </button>
      </div>
    );
  }

  const { summary, statusBreakdown, recentCases } = data || {};

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">AccuDefend Overview</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="btn-secondary"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Cases"
          value={summary?.totalCases || 0}
          icon={FileText}
          trend={summary?.trends?.cases}
          description="Last 30 days"
        />
        <StatCard
          title="Total Disputed"
          value={formatCurrency(summary?.totalAmount || 0)}
          icon={DollarSign}
          trend={summary?.trends?.amount}
          description="Amount at risk"
        />
        <StatCard
          title="Win Rate"
          value={`${summary?.winRate || 0}%`}
          icon={CheckCircle}
          positive={summary?.winRate >= 70}
          description="Resolved cases"
        />
        <StatCard
          title="Urgent Cases"
          value={summary?.urgentCases || 0}
          icon={AlertTriangle}
          alert={summary?.urgentCases > 0}
          description="Due within 7 days"
        />
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Cards */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Case Status Overview</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatusCard
                status="PENDING"
                count={statusBreakdown?.PENDING?.count || 0}
                amount={statusBreakdown?.PENDING?.amount || 0}
                icon={Clock}
              />
              <StatusCard
                status="IN_REVIEW"
                count={statusBreakdown?.IN_REVIEW?.count || 0}
                amount={statusBreakdown?.IN_REVIEW?.amount || 0}
                icon={FileText}
              />
              <StatusCard
                status="SUBMITTED"
                count={statusBreakdown?.SUBMITTED?.count || 0}
                amount={statusBreakdown?.SUBMITTED?.amount || 0}
                icon={TrendingUp}
              />
              <StatusCard
                status="WON"
                count={statusBreakdown?.WON?.count || 0}
                amount={statusBreakdown?.WON?.amount || 0}
                icon={CheckCircle}
              />
              <StatusCard
                status="LOST"
                count={statusBreakdown?.LOST?.count || 0}
                amount={statusBreakdown?.LOST?.amount || 0}
                icon={XCircle}
              />
              <StatusCard
                status="EXPIRED"
                count={statusBreakdown?.EXPIRED?.count || 0}
                amount={statusBreakdown?.EXPIRED?.amount || 0}
                icon={AlertTriangle}
              />
            </div>
          </div>
        </div>

        {/* Recovery Summary */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Recovery Summary</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">Amount Recovered</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(summary?.recoveredAmount || 0)}
              </p>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Win Rate</span>
                <span className="font-medium">{summary?.winRate || 0}%</span>
              </div>
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${summary?.winRate || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Cases */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Cases</h2>
          <Link to="/cases" className="text-sm text-blue-600 hover:text-blue-700 flex items-center">
            View all <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Case #</th>
                <th>Guest</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentCases?.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      to={`/cases/${c.id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {c.caseNumber}
                    </Link>
                  </td>
                  <td>{c.guestName}</td>
                  <td className="font-medium">{formatCurrency(c.amount)}</td>
                  <td>
                    <span className={`badge ${getStatusColor(c.status)}`}>
                      {c.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {c.confidenceScore !== null ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
                        c.confidenceScore >= 70
                          ? 'bg-green-100 text-green-700'
                          : c.confidenceScore >= 50
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {c.confidenceScore}%
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="text-gray-500">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
              {(!recentCases || recentCases.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No cases found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, icon: Icon, trend, positive, alert, description }) {
  return (
    <div className={`card card-body ${alert ? 'border-red-200 bg-red-50' : ''}`}>
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg ${
          alert ? 'bg-red-100' : 'bg-blue-50'
        }`}>
          <Icon className={`w-5 h-5 ${alert ? 'text-red-600' : 'text-blue-600'}`} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-sm ${
            trend >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend >= 0 ? (
              <TrendingUp className="w-4 h-4 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 mr-1" />
            )}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{title}</p>
        {description && (
          <p className="text-xs text-gray-400 mt-1">{description}</p>
        )}
      </div>
    </div>
  );
}

// Status Card Component
function StatusCard({ status, count, amount, icon: Icon }) {
  const colors = {
    PENDING: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    IN_REVIEW: 'bg-blue-50 border-blue-200 text-blue-700',
    SUBMITTED: 'bg-purple-50 border-purple-200 text-purple-700',
    WON: 'bg-green-50 border-green-200 text-green-700',
    LOST: 'bg-red-50 border-red-200 text-red-700',
    EXPIRED: 'bg-gray-50 border-gray-200 text-gray-700'
  };

  return (
    <div className={`p-4 rounded-lg border ${colors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{status.replace('_', ' ')}</span>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-sm opacity-80">{formatCurrency(amount)}</p>
    </div>
  );
}
