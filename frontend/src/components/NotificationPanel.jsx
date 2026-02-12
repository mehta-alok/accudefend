/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Notification Panel Component
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  FileText,
  Zap,
  Clock,
  DollarSign,
  Settings,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { api, formatDate } from '../utils/api';

// Notification type icons and colors
const notificationConfig = {
  NEW_CHARGEBACK: {
    icon: DollarSign,
    color: 'text-red-500',
    bgColor: 'bg-red-50'
  },
  CASE_UPDATE: {
    icon: FileText,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50'
  },
  DEADLINE_WARNING: {
    icon: Clock,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50'
  },
  AI_ANALYSIS_COMPLETE: {
    icon: Zap,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50'
  },
  SUBMISSION_RESULT: {
    icon: CheckCheck,
    color: 'text-green-500',
    bgColor: 'bg-green-50'
  },
  SYSTEM_ALERT: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50'
  },
  PMS_SYNC_COMPLETE: {
    icon: RefreshCw,
    color: 'text-teal-500',
    bgColor: 'bg-teal-50'
  }
};

// Priority badge colors
const priorityColors = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-orange-100 text-orange-600',
  URGENT: 'bg-red-100 text-red-600'
};

export default function NotificationPanel({ isOpen, onClose, onCountUpdate }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await api.get('/notifications?limit=20');
      if (response.data.success) {
        setNotifications(response.data.notifications);
        setUnreadCount(response.data.unreadCount);
        onCountUpdate?.(response.data.unreadCount);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load notifications when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Mark single notification as read
  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      onCountUpdate?.(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      onCountUpdate?.(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  // Delete notification
  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      const notification = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (!notification?.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
        onCountUpdate?.(Math.max(0, unreadCount - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  // Clear all notifications
  const clearAll = async () => {
    try {
      await api.delete('/notifications/clear-all');
      setNotifications([]);
      setUnreadCount(0);
      onCountUpdate?.(0);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  };

  // Format time ago
  const timeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(dateString);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 mt-2 w-96 max-h-[80vh] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 animate-fade-in"
    >
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Notification List */}
      <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No notifications</p>
            <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => {
              const config = notificationConfig[notification.type] || notificationConfig.SYSTEM_ALERT;
              const Icon = config.icon;

              return (
                <div
                  key={notification.id}
                  className={`relative px-4 py-3 hover:bg-gray-50 transition-colors ${
                    !notification.isRead ? 'bg-blue-50/50' : ''
                  }`}
                >
                  {/* Unread indicator */}
                  {!notification.isRead && (
                    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                  )}

                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className={`text-sm font-medium text-gray-900 ${!notification.isRead ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                        {notification.priority !== 'MEDIUM' && (
                          <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded ${priorityColors[notification.priority]}`}>
                            {notification.priority}
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">
                          {timeAgo(notification.createdAt)}
                        </span>
                        <div className="flex items-center gap-1">
                          {notification.link && (
                            <Link
                              to={notification.link}
                              onClick={() => {
                                if (!notification.isRead) markAsRead(notification.id);
                                onClose();
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                            >
                              View <ChevronRight className="w-3 h-3" />
                            </Link>
                          )}
                          {!notification.isRead && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Mark as read"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-4 py-2">
        <Link
          to="/settings"
          onClick={onClose}
          className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Notification Settings
        </Link>
      </div>
    </div>
  );
}

// Export NotificationBell component for use in Layout
export function NotificationBell({ onClick, count }) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors group"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
    >
      <Bell className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full ring-2 ring-white animate-pulse">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
