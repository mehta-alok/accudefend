/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * API Client Utility
 */

const API_BASE_URL = '/api';

class ApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = localStorage.getItem('accessToken');

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);

      // Handle 401 - try to refresh token
      if (response.status === 401 && token) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          config.headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`;
          const retryResponse = await fetch(url, config);
          return this.handleResponse(retryResponse);
        }
      }

      return this.handleResponse(response);
    } catch (error) {
      throw new Error(error.message || 'Network error');
    }
  }

  async handleResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.message || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return { data, status: response.status };
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        return true;
      }
    } catch (error) {
      // Refresh failed
    }

    // Clear tokens on refresh failure
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    return false;
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  patch(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  async upload(endpoint, formData, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = localStorage.getItem('accessToken');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: formData,
      ...options
    });

    return this.handleResponse(response);
  }
}

export const api = new ApiClient(API_BASE_URL);

// Helper functions
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (date) => {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getStatusColor = (status) => {
  const colors = {
    PENDING: 'badge-pending',
    IN_REVIEW: 'badge-in-review',
    SUBMITTED: 'badge-submitted',
    WON: 'badge-won',
    LOST: 'badge-lost',
    EXPIRED: 'badge-expired',
    CANCELLED: 'badge-cancelled',
    ARBITRATION: 'badge-in-review'
  };
  return colors[status] || 'badge-pending';
};

export const getConfidenceColor = (score) => {
  if (score >= 70) return 'confidence-high';
  if (score >= 50) return 'confidence-medium';
  return 'confidence-low';
};

// Reservation status colors
export const getReservationStatusColor = (status) => {
  const colors = {
    confirmed: 'bg-gray-100 text-gray-800',
    checked_in: 'bg-blue-100 text-blue-800',
    checked_out: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    no_show: 'bg-orange-100 text-orange-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

// Format relative time (e.g., "5 min ago")
export const formatRelativeTime = (date) => {
  if (!date) return 'Never';
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};
