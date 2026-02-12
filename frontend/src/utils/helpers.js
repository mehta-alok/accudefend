// Format currency
export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

// Format date
export function formatDate(dateString) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

// Format date with time
export function formatDateTime(dateString) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

// Get status color
export function getStatusColor(status) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    submitted: 'bg-blue-100 text-blue-800',
    won: 'bg-green-100 text-green-800',
    lost: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

// Get status icon color
export function getStatusIconColor(status) {
  const colors = {
    pending: 'text-yellow-500',
    submitted: 'text-blue-500',
    won: 'text-green-500',
    lost: 'text-red-500',
  }
  return colors[status] || 'text-gray-500'
}

// Get confidence color
export function getConfidenceColor(score) {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

// Get confidence background
export function getConfidenceBg(score) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

// Get processor color
export function getProcessorColor(processor) {
  const colors = {
    stripe: '#635BFF',
    adyen: '#0ABF53',
    shift4: '#00A4E4',
    elavon: '#003366',
  }
  return colors[processor] || '#6B7280'
}

// Truncate text
export function truncate(text, length = 50) {
  if (!text) return ''
  return text.length > length ? text.substring(0, length) + '...' : text
}
