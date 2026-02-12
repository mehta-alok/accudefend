const { v4: uuidv4 } = require('uuid');

// Mock Users
const users = [
  {
    id: '1',
    email: 'manager@grandhotel.com',
    password: '$2a$10$xVWsJQxHZjXq3GnPJdQjZOkZUQ5vJQxHZjXq3GnPJdQjZO', // "password123"
    name: 'Sarah Johnson',
    role: 'manager',
    property: 'Grand Hotel Downtown',
    provider: 'stripe'
  },
  {
    id: '2',
    email: 'admin@boutiquegroup.com',
    password: '$2a$10$xVWsJQxHZjXq3GnPJdQjZOkZUQ5vJQxHZjXq3GnPJdQjZO',
    name: 'Michael Chen',
    role: 'admin',
    property: 'Boutique Hotel Group',
    provider: 'adyen'
  }
];

// Mock Chargebacks/Cases
const chargebacks = [
  {
    id: 'CB-2026-0001',
    propertyId: '1',
    reservationId: 'RES-78234',
    guestName: 'John Martinez',
    guestEmail: 'j.martinez@email.com',
    amount: 847.50,
    currency: 'USD',
    reasonCode: '10.4',
    reasonDescription: 'Fraudulent Transaction - Card Absent Environment',
    processor: 'stripe',
    status: 'pending',
    confidenceScore: 92,
    dueDate: '2026-02-15',
    checkInDate: '2026-01-10',
    checkOutDate: '2026-01-13',
    roomNumber: '412',
    roomType: 'Deluxe King Suite',
    createdAt: '2026-01-25T14:30:00Z',
    submittedAt: null,
    resolvedAt: null,
    evidence: {
      idScan: true,
      authSignature: true,
      checkoutSignature: true,
      folio: true,
      additionalNotes: false
    },
    aiRecommendation: 'Auto-submit recommended. Strong evidence package with matching ID and signatures.',
    timeline: [
      { date: '2026-01-25T14:30:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-25T14:30:15Z', event: 'Evidence auto-compiled', type: 'system' },
      { date: '2026-01-25T14:30:45Z', event: 'AI analysis complete - 92% confidence', type: 'ai' }
    ]
  },
  {
    id: 'CB-2026-0002',
    propertyId: '1',
    reservationId: 'RES-78456',
    guestName: 'Emily Watson',
    guestEmail: 'ewatson@company.com',
    amount: 1234.00,
    currency: 'USD',
    reasonCode: '13.1',
    reasonDescription: 'Merchandise/Services Not Received',
    processor: 'adyen',
    status: 'submitted',
    confidenceScore: 88,
    dueDate: '2026-02-10',
    checkInDate: '2026-01-05',
    checkOutDate: '2026-01-08',
    roomNumber: '215',
    roomType: 'Standard Double',
    createdAt: '2026-01-20T09:15:00Z',
    submittedAt: '2026-01-20T09:18:00Z',
    resolvedAt: null,
    evidence: {
      idScan: true,
      authSignature: true,
      checkoutSignature: true,
      folio: true,
      additionalNotes: true
    },
    aiRecommendation: 'Strong case. Key card logs show room access during entire stay.',
    timeline: [
      { date: '2026-01-20T09:15:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-20T09:15:30Z', event: 'Evidence auto-compiled', type: 'system' },
      { date: '2026-01-20T09:16:00Z', event: 'AI analysis complete - 88% confidence', type: 'ai' },
      { date: '2026-01-20T09:18:00Z', event: 'Auto-submitted to Adyen', type: 'success' }
    ]
  },
  {
    id: 'CB-2026-0003',
    propertyId: '1',
    reservationId: 'RES-77892',
    guestName: 'Robert Kim',
    guestEmail: 'rkim.personal@gmail.com',
    amount: 562.75,
    currency: 'USD',
    reasonCode: '13.3',
    reasonDescription: 'Not as Described or Defective Merchandise',
    processor: 'shift4',
    status: 'won',
    confidenceScore: 95,
    dueDate: '2026-01-30',
    checkInDate: '2025-12-20',
    checkOutDate: '2025-12-23',
    roomNumber: '308',
    roomType: 'Executive Suite',
    createdAt: '2026-01-05T11:20:00Z',
    submittedAt: '2026-01-05T11:25:00Z',
    resolvedAt: '2026-01-22T16:00:00Z',
    evidence: {
      idScan: true,
      authSignature: true,
      checkoutSignature: true,
      folio: true,
      additionalNotes: true
    },
    aiRecommendation: 'Excellent case. Room photos match listing, no complaints during stay.',
    timeline: [
      { date: '2026-01-05T11:20:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-05T11:25:00Z', event: 'Auto-submitted to Shift4', type: 'success' },
      { date: '2026-01-22T16:00:00Z', event: 'DISPUTE WON - Funds returned', type: 'won' }
    ]
  },
  {
    id: 'CB-2026-0004',
    propertyId: '1',
    reservationId: 'RES-78123',
    guestName: 'Lisa Thompson',
    guestEmail: 'lisa.t@outlook.com',
    amount: 389.00,
    currency: 'USD',
    reasonCode: '4837',
    reasonDescription: 'No Cardholder Authorization',
    processor: 'elavon',
    status: 'lost',
    confidenceScore: 45,
    dueDate: '2026-01-25',
    checkInDate: '2025-12-28',
    checkOutDate: '2025-12-30',
    roomNumber: '105',
    roomType: 'Standard King',
    createdAt: '2026-01-08T08:45:00Z',
    submittedAt: '2026-01-10T14:00:00Z',
    resolvedAt: '2026-01-24T10:30:00Z',
    evidence: {
      idScan: false,
      authSignature: true,
      checkoutSignature: false,
      folio: true,
      additionalNotes: false
    },
    aiRecommendation: 'Manual review recommended. Missing ID scan and checkout signature.',
    timeline: [
      { date: '2026-01-08T08:45:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-08T08:46:00Z', event: 'AI flagged for manual review - Missing evidence', type: 'warning' },
      { date: '2026-01-10T14:00:00Z', event: 'Manually submitted by manager', type: 'info' },
      { date: '2026-01-24T10:30:00Z', event: 'DISPUTE LOST - Insufficient evidence', type: 'lost' }
    ]
  },
  {
    id: 'CB-2026-0005',
    propertyId: '1',
    reservationId: 'RES-78567',
    guestName: 'David Brown',
    guestEmail: 'dbrown@techcorp.io',
    amount: 2156.00,
    currency: 'USD',
    reasonCode: '10.4',
    reasonDescription: 'Fraudulent Transaction - Card Absent Environment',
    processor: 'stripe',
    status: 'pending',
    confidenceScore: 78,
    dueDate: '2026-02-20',
    checkInDate: '2026-01-18',
    checkOutDate: '2026-01-22',
    roomNumber: '501',
    roomType: 'Presidential Suite',
    createdAt: '2026-01-28T16:00:00Z',
    submittedAt: null,
    resolvedAt: null,
    evidence: {
      idScan: true,
      authSignature: true,
      checkoutSignature: false,
      folio: true,
      additionalNotes: false
    },
    aiRecommendation: 'Manual review recommended. Missing checkout signature, but ID and auth are strong.',
    timeline: [
      { date: '2026-01-28T16:00:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-28T16:00:30Z', event: 'Evidence compiled - checkout signature missing', type: 'warning' },
      { date: '2026-01-28T16:01:00Z', event: 'AI analysis - 78% confidence, manual review suggested', type: 'ai' }
    ]
  },
  {
    id: 'CB-2026-0006',
    propertyId: '1',
    reservationId: 'RES-78890',
    guestName: 'Amanda Garcia',
    guestEmail: 'agarcia@email.com',
    amount: 723.50,
    currency: 'USD',
    reasonCode: '13.7',
    reasonDescription: 'Cancelled Merchandise/Services',
    processor: 'adyen',
    status: 'submitted',
    confidenceScore: 91,
    dueDate: '2026-02-18',
    checkInDate: '2026-01-12',
    checkOutDate: '2026-01-15',
    roomNumber: '224',
    roomType: 'Deluxe Double',
    createdAt: '2026-01-27T10:30:00Z',
    submittedAt: '2026-01-27T10:35:00Z',
    resolvedAt: null,
    evidence: {
      idScan: true,
      authSignature: true,
      checkoutSignature: true,
      folio: true,
      additionalNotes: true
    },
    aiRecommendation: 'Auto-submit recommended. Cancellation policy was acknowledged at booking.',
    timeline: [
      { date: '2026-01-27T10:30:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-27T10:32:00Z', event: 'Evidence compiled with cancellation policy docs', type: 'system' },
      { date: '2026-01-27T10:35:00Z', event: 'Auto-submitted to Adyen', type: 'success' }
    ]
  },
  {
    id: 'CB-2026-0007',
    propertyId: '1',
    reservationId: 'RES-78234B',
    guestName: 'Chris Anderson',
    guestEmail: 'canderson@work.com',
    amount: 456.00,
    currency: 'USD',
    reasonCode: '4855',
    reasonDescription: 'Non-Receipt of Goods/Services',
    processor: 'stripe',
    status: 'won',
    confidenceScore: 94,
    dueDate: '2026-01-28',
    checkInDate: '2025-12-15',
    checkOutDate: '2025-12-17',
    roomNumber: '318',
    roomType: 'Standard King',
    createdAt: '2026-01-02T13:00:00Z',
    submittedAt: '2026-01-02T13:05:00Z',
    resolvedAt: '2026-01-20T09:00:00Z',
    evidence: {
      idScan: true,
      authSignature: true,
      checkoutSignature: true,
      folio: true,
      additionalNotes: false
    },
    aiRecommendation: 'Strong case with complete evidence and key card access logs.',
    timeline: [
      { date: '2026-01-02T13:00:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-02T13:05:00Z', event: 'Auto-submitted to Stripe', type: 'success' },
      { date: '2026-01-20T09:00:00Z', event: 'DISPUTE WON - Funds returned', type: 'won' }
    ]
  },
  {
    id: 'CB-2026-0008',
    propertyId: '1',
    reservationId: 'RES-79001',
    guestName: 'Jennifer Lee',
    guestEmail: 'jlee@personal.com',
    amount: 1089.25,
    currency: 'USD',
    reasonCode: '10.4',
    reasonDescription: 'Fraudulent Transaction - Card Absent Environment',
    processor: 'shift4',
    status: 'pending',
    confidenceScore: 85,
    dueDate: '2026-02-25',
    checkInDate: '2026-01-20',
    checkOutDate: '2026-01-24',
    roomNumber: '410',
    roomType: 'Junior Suite',
    createdAt: '2026-01-29T11:00:00Z',
    submittedAt: null,
    resolvedAt: null,
    evidence: {
      idScan: true,
      authSignature: true,
      checkoutSignature: true,
      folio: true,
      additionalNotes: false
    },
    aiRecommendation: 'Auto-submit recommended. All evidence present with strong ID match.',
    timeline: [
      { date: '2026-01-29T11:00:00Z', event: 'Chargeback received', type: 'alert' },
      { date: '2026-01-29T11:00:45Z', event: 'Evidence compiled successfully', type: 'system' },
      { date: '2026-01-29T11:01:30Z', event: 'AI analysis complete - 85% confidence', type: 'ai' }
    ]
  }
];

// Analytics data
const analytics = {
  overview: {
    totalCases: 47,
    pendingCases: 3,
    submittedCases: 8,
    wonCases: 28,
    lostCases: 8,
    winRate: 77.8,
    totalRecovered: 42560.50,
    avgConfidenceScore: 84.2,
    avgResponseTime: '4.2 minutes'
  },
  monthly: [
    { month: 'Aug 2025', cases: 5, won: 3, lost: 2, recovered: 2340 },
    { month: 'Sep 2025', cases: 7, won: 5, lost: 2, recovered: 4560 },
    { month: 'Oct 2025', cases: 6, won: 5, lost: 1, recovered: 5230 },
    { month: 'Nov 2025', cases: 8, won: 6, lost: 2, recovered: 7890 },
    { month: 'Dec 2025', cases: 9, won: 7, lost: 2, recovered: 9450 },
    { month: 'Jan 2026', cases: 12, won: 8, lost: 1, pending: 3, recovered: 13090.50 }
  ],
  byProcessor: [
    { processor: 'Stripe', cases: 18, winRate: 82, recovered: 15670 },
    { processor: 'Adyen', cases: 14, winRate: 78, recovered: 12340 },
    { processor: 'Shift4', cases: 10, winRate: 75, recovered: 9280 },
    { processor: 'Elavon', cases: 5, winRate: 60, recovered: 5270 }
  ],
  byReasonCode: [
    { code: '10.4', description: 'Fraudulent Transaction', cases: 15, winRate: 80 },
    { code: '13.1', description: 'Services Not Received', cases: 12, winRate: 85 },
    { code: '13.3', description: 'Not as Described', cases: 8, winRate: 75 },
    { code: '13.7', description: 'Cancelled Services', cases: 7, winRate: 71 },
    { code: '4837', description: 'No Authorization', cases: 5, winRate: 60 }
  ]
};

// Provider configurations
const providers = [
  { id: 'stripe', name: 'Stripe', category: 'payment', logo: '💳', color: '#635BFF' },
  { id: 'adyen', name: 'Adyen', category: 'payment', logo: '💳', color: '#0ABF53' },
  { id: 'shift4', name: 'Shift4', category: 'payment', logo: '💳', color: '#00A4E4' },
  { id: 'elavon', name: 'Elavon', category: 'payment', logo: '💳', color: '#003366' },
  { id: 'mews', name: 'Mews', category: 'pms', logo: '🏨', color: '#00B4B4' },
  { id: 'opera', name: 'Opera Cloud', category: 'pms', logo: '🏨', color: '#C74634' },
  { id: 'cloudbeds', name: 'Cloudbeds', category: 'pms', logo: '🏨', color: '#4A90D9' },
  { id: 'canary', name: 'Canary Technologies', category: 'hospitality', logo: '🐦', color: '#FFD700' }
];

module.exports = {
  users,
  chargebacks,
  analytics,
  providers
};
