/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Zod Validation Schemas
 */

const { z } = require('zod');

// =============================================================================
// ENUMS
// =============================================================================

const UserRole = z.enum(['ADMIN', 'MANAGER', 'STAFF', 'READONLY']);

const ChargebackStatus = z.enum([
  'PENDING',
  'IN_REVIEW',
  'SUBMITTED',
  'WON',
  'LOST',
  'EXPIRED',
  'CANCELLED'
]);

const EvidenceType = z.enum([
  'ID_SCAN',
  'AUTH_SIGNATURE',
  'CHECKOUT_SIGNATURE',
  'FOLIO',
  'RESERVATION_CONFIRMATION',
  'CANCELLATION_POLICY',
  'CANCELLATION_POLICY_VIOLATION',
  'KEY_CARD_LOG',
  'CCTV_FOOTAGE',
  'CORRESPONDENCE',
  'INCIDENT_REPORT',
  'DAMAGE_PHOTOS',
  'POLICE_REPORT',
  'NO_SHOW_DOCUMENTATION',
  'OTHER'
]);

const DisputeType = z.enum([
  'FRAUD',
  'SERVICES_NOT_RECEIVED',
  'NOT_AS_DESCRIBED',
  'CANCELLED',
  'IDENTITY_FRAUD',
  'GUEST_BEHAVIOR_ABUSE',
  'NO_SHOW',
  'POLICY_VIOLATION',
  'OCCUPANCY_FRAUD'
]);

const ProviderType = z.enum(['PAYMENT_PROCESSOR', 'PMS', 'HOSPITALITY']);

const AIRecommendation = z.enum([
  'AUTO_SUBMIT',
  'REVIEW_RECOMMENDED',
  'GATHER_MORE_EVIDENCE',
  'UNLIKELY_TO_WIN'
]);

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: UserRole.default('STAFF'),
  propertyId: z.string().uuid().optional()
});

// =============================================================================
// CASE SCHEMAS
// =============================================================================

const createCaseSchema = z.object({
  // Guest Information
  guestName: z.string().min(1, 'Guest name is required').max(200),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().max(50).optional(),

  // Financial Details
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters (e.g., USD)').default('USD'),
  transactionId: z.string().min(1, 'Transaction ID is required'),
  cardLastFour: z.string().length(4).optional(),
  cardBrand: z.string().optional(),

  // Dispute Details
  reasonCode: z.string().min(1, 'Reason code is required'),
  reasonDescription: z.string().optional(),
  disputeDate: z.string().datetime().or(z.date()),
  dueDate: z.string().datetime().or(z.date()).optional(),
  processorDisputeId: z.string().optional(),

  // Stay Information
  checkInDate: z.string().datetime().or(z.date()),
  checkOutDate: z.string().datetime().or(z.date()),
  roomNumber: z.string().optional(),
  roomType: z.string().optional(),
  confirmationNumber: z.string().optional(),

  // Relations
  propertyId: z.string().uuid(),
  providerId: z.string().uuid()
});

const updateCaseSchema = createCaseSchema.partial();

const updateCaseStatusSchema = z.object({
  status: ChargebackStatus,
  notes: z.string().optional()
});

const caseFilterSchema = z.object({
  status: z.string().optional(),
  propertyId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'dueDate', 'amount', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// =============================================================================
// EVIDENCE SCHEMAS
// =============================================================================

const uploadEvidenceSchema = z.object({
  type: EvidenceType,
  description: z.string().optional()
});

// =============================================================================
// WEBHOOK SCHEMAS
// =============================================================================

const stripeWebhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.record(z.any())
  })
});

const adyenWebhookEventSchema = z.object({
  live: z.boolean(),
  notificationItems: z.array(z.object({
    NotificationRequestItem: z.record(z.any())
  }))
});

// =============================================================================
// PROPERTY SCHEMAS
// =============================================================================

const createPropertySchema = z.object({
  name: z.string().min(1, 'Property name is required').max(200),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().length(2, 'Country code must be 2 characters').default('US'),
  postalCode: z.string().optional(),
  timezone: z.string().default('America/New_York'),
  currency: z.string().length(3).default('USD')
});

// =============================================================================
// PROVIDER SCHEMAS
// =============================================================================

const createProviderSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  type: ProviderType,
  credentials: z.record(z.any()).optional(),
  webhookSecret: z.string().optional(),
  enabled: z.boolean().default(true)
});

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Enums
  UserRole,
  ChargebackStatus,
  EvidenceType,
  DisputeType,
  ProviderType,
  AIRecommendation,

  // Auth
  loginSchema,
  registerSchema,

  // Cases
  createCaseSchema,
  updateCaseSchema,
  updateCaseStatusSchema,
  caseFilterSchema,

  // Evidence
  uploadEvidenceSchema,

  // Webhooks
  stripeWebhookEventSchema,
  adyenWebhookEventSchema,

  // Property & Provider
  createPropertySchema,
  createProviderSchema
};
