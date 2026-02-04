/**
 * AccuDefend - Hotel Chargeback Defense System
 * Analytics Page
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { RefreshCw, TrendingUp, DollarSign, Target, Award } from 'lucide-react';
import { api, formatCurrency } from '../utils/api';

const COLORS = ['#006fc6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState(null);
  const [processorData, setProcessorData] = useState(null);
  const [reasonCodeData, setReasonCodeData] = useState(null);
  const [aiPerformance, setAiPerformance] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [monthly, processors, reasons, ai] = await Promise.all([
        api.get('/analytics/monthly?months=12'),
        api.get('/analytics/processors'),
        api.get('/analytics/reason-codes'),
        api.get('/analytics/ai-performance')
      ]);

      setMonthlyData(monthly.data);
      setProcessorData(processors.data);
      setReasonCodeData(reasons.data);
      setAiPerformance(ai.data);
    } catch (err) {
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-omni-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500">AccuDefend chargeback performance metrics</p>
        </div>
        <button onClick={fetchData} className="btn-secondary">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-omni-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-omni-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Cases (12mo)</p>
              <p className="text-2xl font-bold">{monthlyData?.totals?.cases || 0}</p>
            </div>
          </div>
        </div>
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Disputed</p>
              <p className="text-2xl font-bold">{formatCurrency(monthlyData?.totals?.amount || 0)}</p>
            </div>
          </div>
        </div>
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Target className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Won Cases</p>
              <p className="text-2xl font-bold">{monthlyData?.totals?.won || 0}</p>
            </div>
          </div>
        </div>
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Award className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">AI Accuracy</p>
              <p className="text-2xl font-bold">{aiPerformance?.overview?.overallAccuracy || 0}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Monthly Case Trend</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cases"
                  name="Total Cases"
                  stroke="#006fc6"
                  strokeWidth={2}
                  dot={{ fill: '#006fc6' }}
                />
                <Line
                  type="monotone"
                  dataKey="won"
                  name="Won"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win Rate Trend */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Win Rate Over Time</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                  formatter={(value) => [`${value}%`, 'Win Rate']}
                />
                <Bar dataKey="winRate" name="Win Rate %" fill="#006fc6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Processor */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Cases by Processor</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={processorData?.processors || []}
                  dataKey="totalCases"
                  nameKey="providerName"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                >
                  {(processorData?.processors || []).map((entry, index) => (
                    <Cell key={entry.providerId} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win Rate by Processor */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h3 className="font-semibold">Win Rate by Payment Processor</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={processorData?.processors || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                <YAxis dataKey="providerName" type="category" width={100} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                  formatter={(value) => [`${value}%`, 'Win Rate']}
                />
                <Bar dataKey="winRate" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Reason Code Analysis */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Performance by Reason Code</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Reason Code</th>
                <th>Description</th>
                <th>Total Cases</th>
                <th>Amount</th>
                <th>Won</th>
                <th>Lost</th>
                <th>Win Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(reasonCodeData?.reasonCodes || []).slice(0, 10).map((rc) => (
                <tr key={rc.reasonCode}>
                  <td className="font-mono font-medium">{rc.reasonCode}</td>
                  <td className="text-sm text-gray-600 max-w-[200px] truncate">
                    {rc.description}
                  </td>
                  <td>{rc.totalCases}</td>
                  <td>{formatCurrency(rc.totalAmount)}</td>
                  <td className="text-green-600">{rc.won}</td>
                  <td className="text-red-600">{rc.lost}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full">
                        <div
                          className={`h-full rounded-full ${
                            rc.winRate >= 70 ? 'bg-green-500' :
                            rc.winRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${rc.winRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{rc.winRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">AI Recommendation Accuracy</h3>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              {Object.entries(aiPerformance?.byRecommendation || {}).map(([rec, data]) => (
                <div key={rec} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{rec.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-500">{data.totalCases} cases</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-gray-200 rounded-full">
                      <div
                        className={`h-full rounded-full ${
                          data.accuracy >= 70 ? 'bg-green-500' :
                          data.accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${data.accuracy}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12">{data.accuracy}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Actual Win Rate by Confidence Score</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={aiPerformance?.byConfidenceScore || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                  formatter={(value) => [`${value}%`, 'Win Rate']}
                />
                <Bar dataKey="actualWinRate" name="Actual Win Rate" fill="#006fc6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
