# AccuDefend - Complete Application Overview

**Version:** 2.0
**Last Updated:** February 2026
**Platform:** AccuDefend (formerly Chargeback Defense OMNI)

---

## Application Views

### 1. Complete Dashboard

- Welcome banner with key metrics
- 4 stat cards: Total Cases, Pending, Win Rate, Recovered
- Quick action buttons
- Recent cases overview
- Urgent cases section (due within 7 days)
- Real-time charts and trend visualization (Recharts)

### 2. Full Cases View

- Search functionality (by ID, guest name, confirmation number)
- Status filter dropdown (Pending, In Review, Submitted, Won, Lost, Expired, Cancelled)
- Detailed case cards with:
  - Guest info, reservation details
  - AI confidence scoring with visual progress bar
  - Evidence checklist with completion tracking
  - Auto-submit buttons for eligible cases
  - Status-specific action buttons

### 3. Analytics View

- Case status distribution with progress bars
- Performance metrics: Win Rate, Avg Confidence, Total Recovered
- Payment processor breakdown (Stripe, Adyen, Shift4, Elavon)
- Win rate by reason code analysis
- Property comparison (multi-property)
- Historical trends with date range filtering

### 4. Case Detail View

- Full case information grid
- Evidence package viewer with upload/download
- AI confidence score with weighted breakdown:
  - Reason Code Base (40%)
  - Evidence Completeness (35%)
  - Fraud Indicators (25%)
- Recommendation display (AUTO_SUBMIT / REVIEW_RECOMMENDED / GATHER_MORE_EVIDENCE / UNLIKELY_TO_WIN)
- Timeline of case events
- Case notes (internal/external)
- Action buttons: Submit, Generate PDF, Download

### 5. Settings Page

- AI Defense Configuration (confidence thresholds)
- Email notification preferences
- Storage health monitoring
- Provider management
- User account settings

### 6. PMS Integration Page (NEW)

- Connect/disconnect 12+ PMS systems
- Connection status monitoring
- Sync triggers and history
- Supported systems: Oracle Opera Cloud, Mews, AutoClerk, Cloudbeds, protel, StayNTouch, Apaleo, innRoad, WebRezPro, RoomMaster, Little Hotelier, RoomKeyPMS

### 7. Dispute Integration Page (NEW)

- Dispute company management
- Merlink 2-way sync configuration
- Company CRUD operations
- Sync status and history

### 8. Tutorial Page (NEW)

- Dedicated tutorial walkthrough
- 8-step guided onboarding:
  1. Welcome - Introduction to AccuDefend
  2. Dashboard Overview - Understanding metrics and KPIs
  3. Managing Cases - Navigating and filtering
  4. Uploading Evidence - Adding documentation
  5. AI Analysis - Understanding confidence scores
  6. PMS Integration - Connecting to PMS systems
  7. Configuration - Admin settings and thresholds
  8. Completion - Ready to use

### 9. Notification Panel (NEW)

- Dropdown notification panel in header
- Real-time alerts for new chargebacks, status changes
- Mark as read/unread
- Mark all as read
- Quick navigation to related cases

### 10. Mobile Responsive

- Hamburger menu for mobile navigation
- Responsive grid layouts (Tailwind CSS breakpoints)
- Touch-friendly buttons and interactions
- Optimized for all screen sizes

### 11. Interactive Features

- Search cases by ID, guest name, or confirmation number
- Filter by status, processor, date range
- Auto-submit functionality for high-confidence cases
- View case details with full evidence package
- Notification badge with active count
- Keyboard shortcut (`?`) for help panel
- Smooth transitions and hover effects

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router 6 |
| HTTP Client | Axios |
| Icons | Lucide React |
| Charts | Recharts |

## Frontend Architecture

```
frontend/src/
├── App.jsx                    # Main application component
├── main.jsx                   # Entry point
├── index.css                  # Global styles
├── components/
│   ├── Layout.jsx             # Main layout with sidebar & navigation
│   ├── Tutorial.jsx           # Tutorial, HelpButton, HelpPanel
│   └── NotificationPanel.jsx  # Notification dropdown panel
├── pages/
│   ├── Login.jsx              # Authentication
│   ├── Dashboard.jsx          # Main dashboard with metrics
│   ├── Cases.jsx              # Case list & management
│   ├── CaseDetail.jsx         # Individual case details
│   ├── Analytics.jsx          # Reports & analytics
│   ├── Settings.jsx           # System configuration
│   ├── PMSIntegration.jsx     # PMS system connections
│   ├── DisputeIntegration.jsx # Dispute company integrations
│   └── Tutorial.jsx           # Dedicated tutorial page
├── hooks/
│   └── useAuth.jsx            # Authentication context & state
└── utils/
    ├── api.js                 # API client & formatting utilities
    └── helpers.js             # Helper functions
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2026 | Initial application overview |
| 2.0 | February 2026 | Updated to include: PMS Integration page, Dispute Integration page, Tutorial page, NotificationPanel component, helpers.js utility, 12+ PMS systems, Merlink sync, current tech stack |

---

*© 2026 AccuDefend. All rights reserved.*
