/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Guest Folio Viewer Component
 *
 * Displays itemized PMS folio charges grouped by category with running balance.
 *
 * Props:
 *   - reservationId: ID of the reservation whose folio to fetch
 *   - onClose: callback to close/collapse the viewer
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  RefreshCw,
  AlertTriangle,
  X,
  DollarSign,
  BedDouble,
  Receipt,
  UtensilsCrossed,
  ShoppingBag,
  CreditCard,
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  Paperclip,
  CheckCircle,
  CalendarDays
} from 'lucide-react';
import { api, formatCurrency, formatDate } from '../utils/api';

/**
 * Category configuration for folio line items.
 * Each category has a color theme for its header and matching icon.
 */
const CATEGORY_CONFIG = {
  ROOM: {
    label: 'Room Charges',
    icon: BedDouble,
    headerBg: 'bg-blue-600',
    headerText: 'text-white',
    rowHighlight: 'bg-blue-50',
    iconColor: 'text-blue-600'
  },
  TAX_FEE: {
    label: 'Taxes & Fees',
    icon: Receipt,
    headerBg: 'bg-gray-600',
    headerText: 'text-white',
    rowHighlight: 'bg-gray-50',
    iconColor: 'text-gray-600'
  },
  FOOD_BEVERAGE: {
    label: 'Food & Beverage',
    icon: UtensilsCrossed,
    headerBg: 'bg-green-600',
    headerText: 'text-white',
    rowHighlight: 'bg-green-50',
    iconColor: 'text-green-600'
  },
  INCIDENTAL: {
    label: 'Incidentals',
    icon: ShoppingBag,
    headerBg: 'bg-yellow-600',
    headerText: 'text-white',
    rowHighlight: 'bg-yellow-50',
    iconColor: 'text-yellow-600'
  },
  PAYMENT: {
    label: 'Payments',
    icon: CreditCard,
    headerBg: 'bg-purple-600',
    headerText: 'text-white',
    rowHighlight: 'bg-purple-50',
    iconColor: 'text-purple-600'
  },
  ADJUSTMENT: {
    label: 'Adjustments',
    icon: ArrowDownUp,
    headerBg: 'bg-red-600',
    headerText: 'text-white',
    rowHighlight: 'bg-red-50',
    iconColor: 'text-red-600'
  }
};

// Fallback for unrecognized categories
const DEFAULT_CATEGORY = {
  label: 'Other',
  icon: FileText,
  headerBg: 'bg-gray-500',
  headerText: 'text-white',
  rowHighlight: 'bg-gray-50',
  iconColor: 'text-gray-500'
};

/**
 * Category ordering for display.
 */
const CATEGORY_ORDER = [
  'ROOM',
  'TAX_FEE',
  'FOOD_BEVERAGE',
  'INCIDENTAL',
  'PAYMENT',
  'ADJUSTMENT'
];

export default function GuestFolioViewer({ reservationId, onClose }) {
  const [folio, setFolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [attachingEvidence, setAttachingEvidence] = useState(false);
  const [attachSuccess, setAttachSuccess] = useState(false);

  const fetchFolio = async () => {
    if (!reservationId) return;
    setLoading(true);
    try {
      const response = await api.get(`/reservations/${reservationId}/folio`);
      setFolio(response.data.folio || response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolio();
  }, [reservationId]);

  /**
   * Group line items by category and compute running balance and subtotals.
   */
  const { groupedItems, totalCharges, totalPayments, balance, runningBalances } = useMemo(() => {
    if (!folio?.lineItems) {
      return { groupedItems: {}, totalCharges: 0, totalPayments: 0, balance: 0, runningBalances: {} };
    }

    const items = folio.lineItems;

    // Sort items by date for running balance calculation
    const sortedItems = [...items].sort(
      (a, b) => new Date(a.date || a.postingDate) - new Date(b.date || b.postingDate)
    );

    // Calculate running balance across all items in chronological order
    let runningBal = 0;
    const balanceMap = {};
    sortedItems.forEach((item) => {
      runningBal += item.amount || 0;
      balanceMap[item.id || `${item.date}-${item.description}-${item.amount}`] = runningBal;
    });

    // Group by category
    const grouped = {};
    let charges = 0;
    let payments = 0;

    items.forEach((item) => {
      const cat = item.category || 'OTHER';
      const normalizedCat = CATEGORY_ORDER.includes(cat) ? cat : 'OTHER';

      if (!grouped[normalizedCat]) {
        grouped[normalizedCat] = {
          items: [],
          subtotal: 0
        };
      }
      grouped[normalizedCat].items.push(item);
      grouped[normalizedCat].subtotal += item.amount || 0;

      if ((item.amount || 0) >= 0) {
        charges += item.amount || 0;
      } else {
        payments += Math.abs(item.amount || 0);
      }
    });

    return {
      groupedItems: grouped,
      totalCharges: folio.totalCharges ?? charges,
      totalPayments: folio.totalPayments ?? payments,
      balance: folio.balance ?? (charges - payments),
      runningBalances: balanceMap
    };
  }, [folio]);

  const toggleCategory = (category) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleAttachAsEvidence = async () => {
    setAttachingEvidence(true);
    setAttachSuccess(false);
    try {
      await api.post(`/reservations/${reservationId}/folio/attach-evidence`);
      setAttachSuccess(true);
      setTimeout(() => setAttachSuccess(false), 3000);
    } catch (err) {
      alert(`Failed to attach folio: ${err.message}`);
    } finally {
      setAttachingEvidence(false);
    }
  };

  /**
   * Get the unique key for a line item to look up its running balance.
   */
  const getItemKey = (item) => {
    return item.id || `${item.date}-${item.description}-${item.amount}`;
  };

  /**
   * Determine if a row should be highlighted because the card matches a linked chargeback.
   */
  const isChargebackMatch = (item) => {
    if (!folio?.linkedChargebackCards || !item.cardLastFour) return false;
    return folio.linkedChargebackCards.includes(item.cardLastFour);
  };

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-8 text-center">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
        <p className="mt-2 text-sm text-gray-500">Loading folio data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-gray-200 rounded-lg p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="mt-2 text-red-600 font-medium">Failed to load folio</p>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <button onClick={fetchFolio} className="btn-primary mt-3 text-sm">
          <RefreshCw className="w-4 h-4 mr-1" />
          Retry
        </button>
      </div>
    );
  }

  if (!folio) return null;

  // Build the ordered list of categories to render
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((cat) => groupedItems[cat]),
    ...Object.keys(groupedItems).filter((cat) => !CATEGORY_ORDER.includes(cat))
  ];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5" />
            <div>
              <h3 className="font-semibold">Guest Folio</h3>
              <p className="text-sm text-gray-300">
                {folio.confirmationNumber && `#${folio.confirmationNumber}`}
                {folio.guestName && ` - ${folio.guestName}`}
                {folio.checkInDate && folio.checkOutDate && (
                  <span className="ml-2 text-gray-400">
                    ({formatDate(folio.checkInDate)} to {formatDate(folio.checkOutDate)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAttachAsEvidence}
              disabled={attachingEvidence}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                attachSuccess
                  ? 'bg-green-600 text-white'
                  : 'bg-white bg-opacity-10 hover:bg-opacity-20 text-white'
              } disabled:opacity-50`}
            >
              {attachSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Attached
                </>
              ) : attachingEvidence ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Attaching...
                </>
              ) : (
                <>
                  <Paperclip className="w-4 h-4" />
                  Attach as Evidence
                </>
              )}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white hover:bg-opacity-10 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200">
        <div className="p-4 text-center">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Charges</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(totalCharges)}</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Payments</p>
          <p className="text-xl font-bold text-green-700 mt-1">
            -{formatCurrency(totalPayments)}
          </p>
        </div>
        <div className={`p-4 text-center ${balance > 0 ? 'bg-red-50' : balance < 0 ? 'bg-green-50' : ''}`}>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Balance</p>
          <p className={`text-xl font-bold mt-1 ${
            balance > 0 ? 'text-red-700' : balance < 0 ? 'text-green-700' : 'text-gray-900'
          }`}>
            {formatCurrency(balance)}
          </p>
        </div>
      </div>

      {/* Itemized Table by Category */}
      <div className="overflow-x-auto">
        {orderedCategories.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-3 text-gray-500">No folio line items found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 w-28">
                  Date
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5">
                  Description
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 w-28">
                  Amount
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 w-28 hidden md:table-cell">
                  Txn Code
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 w-28 hidden lg:table-cell">
                  Auth Code
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 w-32 hidden sm:table-cell">
                  Running Bal
                </th>
              </tr>
            </thead>
            <tbody>
              {orderedCategories.map((catKey) => {
                const config = CATEGORY_CONFIG[catKey] || DEFAULT_CATEGORY;
                const group = groupedItems[catKey];
                const Icon = config.icon;
                const isCollapsed = collapsedCategories[catKey];

                return (
                  <React.Fragment key={catKey}>
                    {/* Category Header Row */}
                    <tr
                      className={`${config.headerBg} cursor-pointer select-none`}
                      onClick={() => toggleCategory(catKey)}
                    >
                      <td colSpan={6} className="px-4 py-2.5">
                        <div className="flex items-center justify-between">
                          <div className={`flex items-center gap-2 ${config.headerText}`}>
                            <Icon className="w-4 h-4" />
                            <span className="font-semibold text-sm">
                              {config.label}
                            </span>
                            <span className="opacity-75 text-xs">
                              ({group.items.length} item{group.items.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <div className={`flex items-center gap-3 ${config.headerText}`}>
                            <span className="font-bold text-sm">
                              {formatCurrency(group.subtotal)}
                            </span>
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4 opacity-75" />
                            ) : (
                              <ChevronUp className="w-4 h-4 opacity-75" />
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Category Line Items */}
                    {!isCollapsed &&
                      group.items.map((item, idx) => {
                        const matchesChargeback = isChargebackMatch(item);
                        const itemKey = getItemKey(item);
                        const runBal = runningBalances[itemKey];

                        return (
                          <tr
                            key={`${catKey}-${idx}`}
                            className={`border-b border-gray-100 transition-colors ${
                              matchesChargeback
                                ? 'bg-yellow-50 hover:bg-yellow-100'
                                : `hover:${config.rowHighlight}`
                            }`}
                          >
                            <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">
                              {item.date || item.postingDate
                                ? formatDate(item.date || item.postingDate)
                                : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-900">
                                  {item.description || 'No description'}
                                </span>
                                {matchesChargeback && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-200 text-yellow-800">
                                    <AlertTriangle className="w-3 h-3 mr-0.5" />
                                    CB Match
                                  </span>
                                )}
                              </div>
                              {item.cardLastFour && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Card: ****{item.cardLastFour}
                                </p>
                              )}
                            </td>
                            <td className={`px-4 py-2.5 text-sm font-medium text-right whitespace-nowrap ${
                              (item.amount || 0) < 0 ? 'text-green-700' : 'text-gray-900'
                            }`}>
                              {(item.amount || 0) < 0 ? '-' : ''}
                              {formatCurrency(Math.abs(item.amount || 0))}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-500 hidden md:table-cell">
                              {item.transactionCode ? (
                                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                  {item.transactionCode}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-500 hidden lg:table-cell">
                              {item.authCode ? (
                                <span className="font-mono text-xs">
                                  {item.authCode}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 text-right font-mono hidden sm:table-cell whitespace-nowrap">
                              {runBal != null ? formatCurrency(runBal) : '—'}
                            </td>
                          </tr>
                        );
                      })}

                    {/* Category Subtotal Row */}
                    {!isCollapsed && (
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td className="px-4 py-2 text-xs text-gray-500 font-medium" colSpan={2}>
                          Subtotal - {config.label}
                        </td>
                        <td className={`px-4 py-2 text-sm font-bold text-right ${
                          group.subtotal < 0 ? 'text-green-700' : 'text-gray-900'
                        }`}>
                          {group.subtotal < 0 ? '-' : ''}
                          {formatCurrency(Math.abs(group.subtotal))}
                        </td>
                        <td className="hidden md:table-cell" />
                        <td className="hidden lg:table-cell" />
                        <td className="hidden sm:table-cell" />
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Grand Total Row */}
              <tr className="bg-gray-900 text-white">
                <td className="px-4 py-3 font-semibold text-sm" colSpan={2}>
                  Grand Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-sm">
                  {formatCurrency(balance)}
                </td>
                <td className="hidden md:table-cell" />
                <td className="hidden lg:table-cell" />
                <td className="hidden sm:table-cell" />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Chargeback Match Legend */}
      {folio?.linkedChargebackCards && folio.linkedChargebackCards.length > 0 && (
        <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <p className="text-xs text-yellow-800">
            <span className="font-medium">Highlighted rows</span> indicate transactions where the
            card last four digits match a linked chargeback (cards:{' '}
            {folio.linkedChargebackCards.map((c) => `****${c}`).join(', ')}).
          </p>
        </div>
      )}
    </div>
  );
}
