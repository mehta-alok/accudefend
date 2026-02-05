# AccuDefend - System Design Document

## Hotel Chargeback Defense System

**Version:** 1.0.0
**Last Updated:** February 2026
**Document Type:** Technical Architecture & System Design

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Database Schema](#5-database-schema)
6. [API Design](#6-api-design)
7. [AI/ML Engine](#7-aiml-engine)
8. [Tutorial & Help System](#8-tutorial--help-system)
9. [Security](#9-security)
10. [Integrations](#10-integrations)
11. [Deployment](#11-deployment)
12. [Appendix](#12-appendix)

---

## 1. Executive Summary

### 1.1 Purpose

AccuDefend is an AI-powered chargeback defense system specifically designed for the hospitality industry. It automates the collection, organization, and analysis of evidence to fight fraudulent chargebacks, significantly improving win rates and reducing revenue loss.

### 1.2 Key Features

- **Automated Evidence Collection** - Gather ID scans, signatures, folios, key card logs
- **AI-Powered Analysis** - Machine learning algorithms calculate win probability
- **Multi-Provider Support** - Integrates with Stripe, Adyen, Shift4, Elavon
- **Real-time Webhooks** - Instant notification of new disputes
- **Configurable Workflows** - Customizable evidence requirements per dispute type
- **Analytics Dashboard** - Track win rates, recovery amounts, trends

### 1.3 Business Value

| Metric | Impact |
|--------|--------|
| Win Rate Improvement | +25-40% |
| Response Time | -70% |
| Labor Cost Reduction | -60% |
| Evidence Completeness | +85% |

---

## 2. System Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ACCUDEFEND PLATFORM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Frontend   │     │   Backend    │     │   Storage    │                │
│  │   (React)    │◄───►│  (Node.js)   │◄───►│   (AWS S3)   │                │
│  │   Port 3000  │     │   Port 8000  │     │              │                │
│  └──────────────┘     └──────┬───────┘     └──────────────┘                │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │  PostgreSQL  │◄───►│    Redis     │     │  AI Engine   │                │
│  │   Database   │     │    Cache     │     │   (Fraud     │                │
│  │              │     │              │     │   Detection) │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL INTEGRATIONS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Stripe  │  │  Adyen   │  │  Shift4  │  │  Elavon  │  │   PMS    │     │
│  │ Webhooks │  │ Webhooks │  │ Webhooks │  │ Webhooks │  │  System  │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Chargeback │     │   Webhook   │     │    Case     │     │     AI      │
│   Created   │────►│   Received  │────►│   Created   │────►│  Analysis   │
│  (Stripe)   │     │  (Backend)  │     │  (Database) │     │  (Scoring)  │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                    │
                                                                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Dispute   │     │   Response  │     │  Evidence   │     │ Recommend-  │
│  Submitted  │◄────│  Generated  │◄────│  Collected  │◄────│   ation     │
│  (Provider) │     │  (System)   │     │   (Staff)   │     │  Generated  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## 3. Architecture

### 3.1 Frontend Architecture

```
frontend/
├── src/
│   ├── App.jsx                 # Main application component
│   ├── main.jsx                # Entry point
│   ├── index.css               # Global styles (Tailwind)
│   │
│   ├── components/
│   │   ├── Layout.jsx          # Main layout with sidebar & help integration
│   │   └── Tutorial.jsx        # Tutorial, HelpButton & HelpPanel components
│   │
│   ├── pages/
│   │   ├── Login.jsx           # Authentication
│   │   ├── Dashboard.jsx       # Main dashboard
│   │   ├── Cases.jsx           # Case list
│   │   ├── CaseDetail.jsx      # Individual case view
│   │   ├── Analytics.jsx       # Reports & analytics
│   │   └── Settings.jsx        # Configuration
│   │
│   ├── hooks/
│   │   └── useAuth.jsx         # Authentication context
│   │
│   └── utils/
│       └── api.js              # API client & helpers
│
├── tailwind.config.js          # Tailwind CSS config
├── vite.config.js              # Vite build config
└── package.json
```

### 3.2 Backend Architecture

```
backend/
├── server.js                   # Express app entry point
│
├── config/
│   ├── database.js             # Prisma client setup
│   ├── redis.js                # Redis connection
│   ├── s3.js                   # AWS S3 configuration
│   └── storage.js              # Storage abstraction layer
│
├── middleware/
│   └── auth.js                 # JWT authentication
│
├── routes/
│   ├── auth.js                 # Login, register, refresh
│   ├── cases.js                # Chargeback CRUD
│   ├── evidence.js             # File upload/download
│   ├── analytics.js            # Reports & metrics
│   ├── admin.js                # Admin functions
│   └── webhooks.js             # Payment provider webhooks
│
├── services/
│   └── fraudDetection.js       # AI analysis engine
│
├── utils/
│   ├── validators.js           # Zod schemas
│   └── logger.js               # Winston logging
│
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.js                 # Initial data
│
└── package.json
```

### 3.3 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Layout Component                             │   │
│  │  ┌──────────┐  ┌──────────────────────────────────────────────┐    │   │
│  │  │ Sidebar  │  │              Page Content                     │    │   │
│  │  │          │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │    │   │
│  │  │ - Dash   │  │  │Dashboard │ │  Cases   │ │ Settings │     │    │   │
│  │  │ - Cases  │  │  │          │ │          │ │          │     │    │   │
│  │  │ - Stats  │  │  │ - Stats  │ │ - Table  │ │ - AI     │     │    │   │
│  │  │ - Config │  │  │ - Charts │ │ - Filter │ │ - Email  │     │    │   │
│  │  │          │  │  │ - Urgent │ │ - Search │ │ - Storage│     │    │   │
│  │  └──────────┘  │  └──────────┘ └──────────┘ └──────────┘     │    │   │
│  │                │                                              │    │   │
│  │                └──────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │   Tutorial/Help     │  │    Auth Context     │                          │
│  │   - Onboarding      │  │    - User state     │                          │
│  │   - Help panel      │  │    - JWT tokens     │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Tech Stack

### 4.1 Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Styling |
| React Router | 6.x | Navigation |
| Lucide React | 0.x | Icons |
| Axios | 1.x | HTTP client |

### 4.2 Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Runtime |
| Express.js | 4.x | Web framework |
| Prisma | 5.x | ORM |
| PostgreSQL | 15.x | Database |
| Redis | 7.x | Caching |
| JWT | - | Authentication |
| Zod | 3.x | Validation |
| Winston | 3.x | Logging |

### 4.3 Infrastructure

| Service | Purpose |
|---------|---------|
| AWS S3 | Evidence file storage |
| AWS CloudFront | CDN (optional) |
| Docker | Containerization |
| Nginx | Reverse proxy |

---

## 5. Database Schema

### 5.1 Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      User       │       │    Property     │       │    Provider     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │       │ id              │
│ email           │       │ name            │       │ name            │
│ passwordHash    │       │ address         │       │ type            │
│ firstName       │◄─────►│ city            │       │ credentials     │
│ lastName        │       │ country         │◄─────►│ webhookSecret   │
│ role            │       │ timezone        │       │ enabled         │
│ propertyId      │       │ currency        │       │                 │
└─────────────────┘       └────────┬────────┘       └────────┬────────┘
                                   │                         │
                                   ▼                         ▼
                          ┌─────────────────────────────────────┐
                          │            Chargeback               │
                          ├─────────────────────────────────────┤
                          │ id                                  │
                          │ caseNumber                          │
                          │ status                              │
                          │ guestName / guestEmail              │
                          │ amount / currency                   │
                          │ transactionId / cardLastFour        │
                          │ reasonCode / reasonDescription      │
                          │ disputeDate / dueDate               │
                          │ checkInDate / checkOutDate          │
                          │ roomNumber / confirmationNumber     │
                          │ confidenceScore                     │
                          │ recommendation                      │
                          │ aiAnalysis                          │
                          │ fraudIndicators                     │
                          └──────────────┬──────────────────────┘
                                         │
           ┌─────────────────────────────┼─────────────────────────────┐
           │                             │                             │
           ▼                             ▼                             ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│    Evidence     │           │ TimelineEvent   │           │    CaseNote     │
├─────────────────┤           ├─────────────────┤           ├─────────────────┤
│ id              │           │ id              │           │ id              │
│ type            │           │ eventType       │           │ content         │
│ fileName        │           │ title           │           │ isInternal      │
│ s3Key           │           │ description     │           │ userId          │
│ mimeType        │           │ metadata        │           │ chargebackId    │
│ fileSize        │           │ chargebackId    │           │                 │
│ verified        │           │                 │           │                 │
│ chargebackId    │           │                 │           │                 │
└─────────────────┘           └─────────────────┘           └─────────────────┘
```

### 5.2 Key Enums

```typescript
// User Roles
enum UserRole {
  ADMIN      // Full system access
  MANAGER    // Property-level management
  STAFF      // Case handling
  READONLY   // View only
}

// Case Status
enum ChargebackStatus {
  PENDING     // New case, awaiting evidence
  IN_REVIEW   // Evidence collected, under review
  SUBMITTED   // Dispute response submitted
  WON         // Case won
  LOST        // Case lost
  EXPIRED     // Response deadline missed
  CANCELLED   // Case cancelled
}

// Evidence Types
enum EvidenceType {
  ID_SCAN                 // Government-issued photo ID
  AUTH_SIGNATURE          // Credit card authorization
  CHECKOUT_SIGNATURE      // Guest signature at checkout
  FOLIO                   // Detailed hotel bill
  RESERVATION_CONFIRMATION
  CANCELLATION_POLICY
  KEY_CARD_LOG            // Room access records
  CCTV_FOOTAGE            // Video evidence
  CORRESPONDENCE          // Emails/messages
  INCIDENT_REPORT         // Staff documentation
  DAMAGE_PHOTOS           // Property damage evidence
  POLICE_REPORT           // Law enforcement docs
  NO_SHOW_DOCUMENTATION
  OTHER
}

// Dispute Types
enum DisputeType {
  FRAUD                   // Unauthorized transaction
  SERVICES_NOT_RECEIVED   // Guest claims no service
  NOT_AS_DESCRIBED        // Service mismatch
  CANCELLED               // Cancellation dispute
  IDENTITY_FRAUD          // Stolen identity
  GUEST_BEHAVIOR_ABUSE    // Damages/violations
  NO_SHOW                 // Failed to arrive
  OCCUPANCY_FRAUD         // Unauthorized guests
}

// AI Recommendations
enum AIRecommendation {
  AUTO_SUBMIT             // High confidence, submit automatically
  REVIEW_RECOMMENDED      // Needs human review
  GATHER_MORE_EVIDENCE    // Missing critical evidence
  UNLIKELY_TO_WIN         // Low win probability
}
```

---

## 6. API Design

### 6.1 Authentication

```
POST   /api/auth/login              # User login
POST   /api/auth/register           # New user registration
POST   /api/auth/refresh            # Refresh access token
POST   /api/auth/logout             # Invalidate session
GET    /api/auth/me                 # Current user info
```

### 6.2 Cases

```
GET    /api/cases                   # List cases (paginated)
GET    /api/cases/:id               # Get case details
POST   /api/cases                   # Create new case
PATCH  /api/cases/:id               # Update case
PATCH  /api/cases/:id/status        # Update case status
POST   /api/cases/:id/analyze       # Trigger AI analysis
POST   /api/cases/:id/notes         # Add case note
```

### 6.3 Evidence

```
GET    /api/evidence/case/:id       # List evidence for case
POST   /api/evidence/upload/:id     # Upload single file
POST   /api/evidence/upload-multiple/:id  # Batch upload
GET    /api/evidence/:id/download   # Get download URL
PATCH  /api/evidence/:id/verify     # Mark as verified
DELETE /api/evidence/:id            # Delete evidence
```

### 6.4 Analytics

```
GET    /api/analytics/dashboard     # Dashboard metrics
GET    /api/analytics/trends        # Historical trends
GET    /api/analytics/by-reason     # Win rate by reason code
GET    /api/analytics/by-property   # Property comparison
```

### 6.5 Admin

```
GET    /api/admin/users             # List users
PATCH  /api/admin/users/:id         # Update user
GET    /api/admin/properties        # List properties
POST   /api/admin/properties        # Create property
GET    /api/admin/providers         # List providers
GET    /api/admin/config            # Get system config
PUT    /api/admin/config            # Update config
GET    /api/admin/storage/status    # Storage health check
GET    /api/admin/audit-log         # Audit trail
```

### 6.6 Webhooks

```
POST   /api/webhooks/stripe         # Stripe dispute events
POST   /api/webhooks/adyen          # Adyen notifications
POST   /api/webhooks/shift4         # Shift4 events
POST   /api/webhooks/elavon         # Elavon events
```

### 6.7 API Response Format

```json
// Success Response
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}

// Error Response
{
  "error": "Error Type",
  "message": "Human readable message",
  "details": [ ... ]  // Validation errors
}
```

---

## 7. AI/ML Engine

### 7.1 Fraud Detection Algorithm

The AI engine calculates a **confidence score (0-100)** representing the probability of winning the dispute.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONFIDENCE SCORE CALCULATION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Final Score = Reason Code Base (40%) + Evidence Score (35%) + Indicators  │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ REASON CODE BASE (40% weight)                                        │   │
│   │                                                                      │   │
│   │ Each reason code has historical win rate:                            │   │
│   │ - 13.1 (Services Not Received): 75% base                            │   │
│   │ - 10.4 (Fraud - Card Absent): 45% base                              │   │
│   │ - 4837 (No Cardholder Auth): 40% base                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ EVIDENCE SCORE (35% weight)                                          │   │
│   │                                                                      │   │
│   │ Evidence Type         Weight                                         │   │
│   │ ─────────────────────────────                                        │   │
│   │ ID Scan               20%                                            │   │
│   │ Auth Signature        20%                                            │   │
│   │ Checkout Signature    15%                                            │   │
│   │ Folio                 15%                                            │   │
│   │ Key Card Log          10%                                            │   │
│   │ Police Report         12%                                            │   │
│   │ Incident Report       10%                                            │   │
│   │ Correspondence        5%                                             │   │
│   │ CCTV Footage          5%                                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ FRAUD INDICATORS (±25 points adjustment)                             │   │
│   │                                                                      │   │
│   │ POSITIVE (+points)           NEGATIVE (-points)                      │   │
│   │ ─────────────────────────────────────────────────                    │   │
│   │ Matching ID        +15       Missing Signature    -20                │   │
│   │ Repeat Guest       +10       Disputed Before      -15                │   │
│   │ Loyalty Member     +10       No-Show History      -15                │   │
│   │ Corporate Booking  +8        Third-Party Booking  -10                │   │
│   │ Advance Booking    +5        Foreign Card         -8                 │   │
│   │ Long Stay          +5        High Value (>$1000)  -5                 │   │
│   │ Direct Booking     +5        Same-Day Booking     -5                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Recommendation Thresholds

| Score Range | Recommendation | Action |
|-------------|----------------|--------|
| 85-100 | AUTO_SUBMIT | Submit dispute automatically |
| 70-84 | REVIEW_RECOMMENDED | Human review before submission |
| 50-69 | GATHER_MORE_EVIDENCE | Collect additional evidence |
| 0-49 | UNLIKELY_TO_WIN | Consider accepting the loss |

### 7.3 Evidence Requirements by Dispute Type

```javascript
const EVIDENCE_PACKETS = {
  fraud: {
    required: ['ID_SCAN', 'AUTH_SIGNATURE', 'FOLIO'],
    recommended: ['KEY_CARD_LOG', 'CCTV_FOOTAGE']
  },
  services_not_received: {
    required: ['FOLIO', 'CHECKOUT_SIGNATURE', 'KEY_CARD_LOG'],
    recommended: ['CORRESPONDENCE', 'CCTV_FOOTAGE']
  },
  identity_fraud: {
    required: ['ID_SCAN', 'AUTH_SIGNATURE', 'CCTV_FOOTAGE'],
    recommended: ['FOLIO', 'KEY_CARD_LOG', 'CORRESPONDENCE']
  },
  guest_behavior_abuse: {
    required: ['FOLIO', 'INCIDENT_REPORT', 'CCTV_FOOTAGE'],
    recommended: ['CORRESPONDENCE', 'DAMAGE_PHOTOS', 'POLICE_REPORT']
  },
  no_show: {
    required: ['RESERVATION_CONFIRMATION', 'CANCELLATION_POLICY', 'FOLIO'],
    recommended: ['CORRESPONDENCE', 'NO_SHOW_DOCUMENTATION']
  },
  occupancy_fraud: {
    required: ['KEY_CARD_LOG', 'FOLIO', 'CCTV_FOOTAGE'],
    recommended: ['INCIDENT_REPORT', 'CHECKOUT_SIGNATURE', 'CORRESPONDENCE']
  }
};
```

---

## 8. Tutorial & Help System

### 8.1 Overview

AccuDefend includes a comprehensive built-in tutorial and help system designed to onboard new users and provide contextual assistance throughout the application.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TUTORIAL & HELP SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    USER ONBOARDING FLOW                              │   │
│  │                                                                      │   │
│  │   First Login ──► Tutorial Auto-Launch ──► Step-by-Step Guide       │   │
│  │        │                                          │                  │   │
│  │        ▼                                          ▼                  │   │
│  │   localStorage ◄──────────────────────── Mark Complete              │   │
│  │   (tutorial_complete)                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    HELP ACCESS METHODS                               │   │
│  │                                                                      │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │   │ Help Button  │  │  Keyboard    │  │  Help Panel  │              │   │
│  │   │ (Bottom-Right)│  │  Shortcut ?  │  │  (Sidebar)   │              │   │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Tutorial Steps

| Step | Title | Description |
|------|-------|-------------|
| 1 | Welcome | Introduction to AccuDefend platform |
| 2 | Dashboard Overview | Real-time metrics and KPIs |
| 3 | Managing Cases | Case list, filtering, and navigation |
| 4 | Uploading Evidence | Evidence requirements and file upload |
| 5 | AI Analysis | Confidence scores and recommendations |
| 6 | Configuration | Admin settings and thresholds |
| 7 | Completion | Ready to use confirmation |

### 8.3 Help Panel Features

```javascript
const helpTopics = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Take the Tutorial', action: onStartTutorial },
      { label: 'Dashboard Overview', link: '/' },
      { label: 'Managing Cases', link: '/cases' },
      { label: 'Analytics & Reports', link: '/analytics' }
    ]
  },
  {
    title: 'Case Management',
    items: [
      { label: 'Creating a New Case', info: 'Via webhooks or API' },
      { label: 'Uploading Evidence', info: 'Evidence tab in case details' },
      { label: 'AI Recommendations', info: 'Confidence scores explained' }
    ]
  },
  {
    title: 'Admin Settings',
    items: [
      { label: 'Defense Configuration', link: '/settings' },
      { label: 'Email Notifications', link: '/settings' }
    ]
  },
  {
    title: 'Quick Tips',
    items: [
      { label: 'Keyboard Shortcuts', info: 'Press ? for help' },
      { label: 'Urgent Cases', info: 'Due within 7 days' },
      { label: 'Win Rate Calculation', info: 'Won / (Won + Lost)' }
    ]
  }
];
```

### 8.4 Component Architecture

```
frontend/src/components/Tutorial.jsx
├── Tutorial (Modal)          # Main tutorial overlay
│   ├── tutorialSteps[]       # Step configuration
│   ├── currentStep state     # Progress tracking
│   └── localStorage          # Completion persistence
│
├── HelpButton (FAB)          # Floating action button
│   └── Fixed bottom-right    # Always visible
│
└── HelpPanel (Sidebar)       # Help documentation panel
    ├── Navigation links      # Quick page access
    ├── Topic sections        # Organized help content
    └── Support contact       # Email link
```

### 8.5 Integration with Layout

The Tutorial system is integrated into the main Layout component:

```jsx
// Layout.jsx integration
import { Tutorial, HelpButton, HelpPanel } from './Tutorial';

// Auto-launch for first-time users
useEffect(() => {
  const tutorialComplete = localStorage.getItem('accudefend_tutorial_complete');
  if (!tutorialComplete) {
    setShowTutorial(true);
  }
}, []);

// Keyboard shortcut (? key)
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      setShowHelpPanel(true);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 8.6 Persistence

| Key | Storage | Purpose |
|-----|---------|---------|
| `accudefend_tutorial_complete` | localStorage | Tracks if user completed tutorial |

---

## 9. Security

### 9.1 Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │  Server  │     │   JWT    │     │ Database │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │  POST /login   │                │                │
     │───────────────►│                │                │
     │                │  Verify user   │                │
     │                │───────────────────────────────►│
     │                │                │                │
     │                │  Generate tokens                │
     │                │───────────────►│                │
     │                │                │                │
     │  Access Token (15m) + Refresh Token (7d)        │
     │◄───────────────│                │                │
     │                │                │                │
     │  API Request + Bearer Token     │                │
     │───────────────►│                │                │
     │                │  Verify JWT    │                │
     │                │───────────────►│                │
     │                │                │                │
     │  Response      │                │                │
     │◄───────────────│                │                │
```

### 9.2 Security Measures

| Layer | Protection |
|-------|------------|
| Transport | HTTPS/TLS 1.3 |
| Authentication | JWT with refresh tokens |
| Password | bcrypt (12 rounds) |
| API | Rate limiting (100 req/15min) |
| Files | S3 server-side encryption (AES-256) |
| Database | Prepared statements (Prisma) |
| Input | Zod validation schemas |
| CORS | Whitelist origins |

### 9.3 Role-Based Access Control

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PERMISSION MATRIX                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Feature              ADMIN    MANAGER    STAFF    READONLY                 │
│  ─────────────────────────────────────────────────────────                  │
│  View Dashboard        ✓         ✓          ✓         ✓                     │
│  View Cases            ✓         ✓          ✓         ✓                     │
│  Create Cases          ✓         ✓          ✓         ✗                     │
│  Update Cases          ✓         ✓          ✓         ✗                     │
│  Upload Evidence       ✓         ✓          ✓         ✗                     │
│  Delete Evidence       ✓         ✓          ✗         ✗                     │
│  View Analytics        ✓         ✓          ✓         ✓                     │
│  System Settings       ✓         ✗          ✗         ✗                     │
│  User Management       ✓         ✗          ✗         ✗                     │
│  AI Configuration      ✓         ✗          ✗         ✗                     │
│  Audit Logs            ✓         ✗          ✗         ✗                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Integrations

### 10.1 Payment Processor Webhooks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WEBHOOK FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Payment Processor                    AccuDefend                           │
│   ─────────────────                    ──────────                           │
│                                                                              │
│   ┌─────────────┐                      ┌─────────────┐                      │
│   │   Stripe    │  POST /webhooks/     │   Webhook   │                      │
│   │   Dispute   │─────────────────────►│   Handler   │                      │
│   │   Created   │  stripe              │             │                      │
│   └─────────────┘                      └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │  Validate   │                      │
│                                        │  Signature  │                      │
│                                        └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │   Create    │                      │
│                                        │    Case     │                      │
│                                        └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │   Run AI    │                      │
│                                        │  Analysis   │                      │
│                                        └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │   Notify    │                      │
│                                        │   Staff     │                      │
│                                        └─────────────┘                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Supported Providers

| Provider | Webhook Events | Status |
|----------|----------------|--------|
| Stripe | charge.dispute.created, updated, closed | ✓ Implemented |
| Adyen | CHARGEBACK, CHARGEBACK_REVERSED | ✓ Implemented |
| Shift4 | dispute.opened, dispute.closed | ✓ Implemented |
| Elavon | chargeback_notification | ✓ Implemented |

### 10.3 Reason Code Mapping

```javascript
// Visa Reason Codes
'13.1' → 'Services Not Received'
'13.2' → 'Cancelled Recurring'
'13.3' → 'Not as Described'
'10.4' → 'Fraud - Card Absent'

// Mastercard Reason Codes
'4855' → 'Non-Receipt'
'4853' → 'Cardholder Dispute'
'4837' → 'No Cardholder Auth'

// Amex Reason Codes
'C14' → 'Paid by Other Means'
'C31' → 'Not as Described'
'F29' → 'Card Not Present Fraud'
```

---

## 11. Deployment

### 11.1 Environment Variables

```bash
# Application
NODE_ENV=production
PORT=8000
APP_NAME=AccuDefend

# Database
DATABASE_URL=postgresql://user:pass@host:5432/accudefend

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_SECRET=<secure-random-string>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AWS S3
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_REGION=us-east-1
AWS_S3_BUCKET=accudefend-evidence

# Payment Providers
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADYEN_API_KEY=...
ADYEN_HMAC_KEY=...

# Security
BCRYPT_SALT_ROUNDS=12
CORS_ORIGINS=https://app.accudefend.com
```

### 11.2 Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://backend:8000

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - redis
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/accudefend
      - REDIS_URL=redis://redis:6379

  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=accudefend

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 11.3 Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              ┌─────────────┐                                │
│                              │ CloudFlare  │                                │
│                              │     DNS     │                                │
│                              └──────┬──────┘                                │
│                                     │                                        │
│                              ┌──────▼──────┐                                │
│                              │    Nginx    │                                │
│                              │   (SSL)     │                                │
│                              └──────┬──────┘                                │
│                                     │                                        │
│                    ┌────────────────┼────────────────┐                      │
│                    │                │                │                      │
│             ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐              │
│             │  Frontend   │  │   Backend   │  │   Backend   │              │
│             │   (React)   │  │  (Node 1)   │  │  (Node 2)   │              │
│             └─────────────┘  └──────┬──────┘  └──────┬──────┘              │
│                                     │                │                      │
│                    ┌────────────────┴────────────────┘                      │
│                    │                                                         │
│             ┌──────▼──────┐  ┌─────────────┐  ┌─────────────┐              │
│             │  PostgreSQL │  │    Redis    │  │   AWS S3    │              │
│             │   (RDS)     │  │ (Elasticache│  │  (Evidence) │              │
│             └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| **Chargeback** | A forced transaction reversal initiated by the cardholder's bank |
| **Reason Code** | A code assigned by card networks explaining the dispute reason |
| **Folio** | The itemized guest bill from the hotel |
| **Representment** | The process of fighting a chargeback by submitting evidence |
| **Pre-arbitration** | Second stage of dispute if initial representment fails |
| **Arbitration** | Final stage where card network makes binding decision |

### 12.2 Reason Code Win Rates (Historical Data)

| Code | Category | Avg Win Rate |
|------|----------|--------------|
| 13.1 | Services Not Received | 75% |
| 13.2 | Cancelled Recurring | 70% |
| 4855 | Non-Receipt (MC) | 75% |
| C14 | Paid by Other Means (Amex) | 70% |
| 13.3 | Not as Described | 55% |
| 10.4 | Fraud - Card Absent | 45% |
| 4837 | No Cardholder Auth | 40% |
| F29 | CNP Fraud (Amex) | 35% |

### 12.3 File Structure

```
Hotel.Chargeback.Fraud_OMNI/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── utils/
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── prisma/
│   ├── uploads/
│   ├── .env
│   └── package.json
│
├── preview.html
├── .gitignore
└── AccuDefend_System_Design.md
```

### 12.4 Quick Start Commands

```bash
# Start Backend
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# Start Frontend
cd frontend
npm install
npm run dev

# Access Application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000

# Login
# Email: admin@accudefend.com
# Password: AccuAdmin123!
```

---

## Document Information

| Field | Value |
|-------|-------|
| Author | AccuDefend Engineering |
| Version | 1.0.0 |
| Status | Production Ready |
| Last Review | February 2026 |

---

*© 2026 AccuDefend. All rights reserved.*
