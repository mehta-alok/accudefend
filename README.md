# AccuDefend - AI-Powered Chargeback Defense Platform

<div align="center">

  **AI-Powered Chargeback Dispute Management Platform**

  *Protecting Hotel Revenue Through Intelligent Defense*

  ![Version](https://img.shields.io/badge/version-1.0.0-blue)
  ![Node](https://img.shields.io/badge/node-20+-green)
  ![License](https://img.shields.io/badge/license-Proprietary-red)
</div>

---

## Overview

**AccuDefend** is an enterprise-grade, AI-powered platform designed to automate and optimize the chargeback dispute process for hotels. The system integrates directly with major payment processors and uses intelligent fraud detection to maximize win rates and protect revenue.

### Key Features

- **AI-Powered Analysis** - Automated confidence scoring and dispute recommendations
- **51 Two-Way Integrations** - 30 PMS systems and 21 dispute & chargeback portal adapters
- **Evidence Management** - AWS S3 storage with secure presigned URLs
- **Real-Time Dashboard** - Live metrics, trends, and case management
- **Dispute Outcome Tracking** - Detailed resolution data for WON/LOST cases with win factors and denial analysis
- **Arbitration Workflow** - 3-step arbitration filing with evidence upload and narrative submission
- **Role-Based Access** - Property-level data isolation with RBAC
- **Audit Trail** - Complete compliance logging for all actions
- **Dispute & Chargeback Integration** - 21 adapters across card networks, processors, and third-party services
- **Notifications System** - Real-time notification panel with alerts
- **Technical Backlog** - Built-in backlog management with sprints and epics
- **AI Agents** - Autonomous agents for backlog management, code review, and security scanning
- **Cloud Infrastructure** - Multi-region AWS deployment with disaster recovery

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ACCUDEFEND SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Frontend   │    │   Backend    │    │   Database   │      │
│  │   React 18   │◄──►│  Node.js 20  │◄──►│  PostgreSQL  │      │
│  │   Tailwind   │    │   Express    │    │    Prisma    │      │
│  │   Recharts   │    │   JWT Auth   │    │              │      │
│  └──────────────┘    └──────┬───────┘    └──────────────┘      │
│                             │                                    │
│                      ┌──────┴───────┐                           │
│                      │    Redis     │                           │
│                      │   Sessions   │                           │
│                      └──────────────┘                           │
│                                                                  │
│  External Integrations (51 total):                              │
│  ├── PMS Systems (30 two-way integrations)                      │
│  ├── Dispute & Chargeback Adapters (21 portals)                 │
│  ├── AWS S3 (Evidence Storage)                                  │
│  └── AI Services (OpenAI, Anthropic APIs)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- AWS Account (for S3)
- Payment processor accounts (Stripe, etc.)

### Development Setup

```bash
# Clone repository
git clone https://github.com/mehta-alok/accudefend.git
cd accudefend

# Start infrastructure
docker-compose up -d postgres redis

# Backend setup
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

### Production Deployment

```bash
# Configure environment
cp .env.example .env
# Edit .env with production values

# Deploy with Docker
docker-compose up -d

# Run migrations
docker-compose exec api npx prisma migrate deploy
```

---

## Demo Mode

AccuDefend can run in **demo mode** without PostgreSQL or Redis. The server automatically detects missing database/cache connections and falls back to in-memory mock data.

### Quick Start (No Dependencies)

```bash
# Backend only - starts on port 8000
cd backend
npm install
npm run dev

# Frontend (new terminal) - starts on port 3000
cd frontend
npm install
npm run dev
```

### Demo Login Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@accudefend.com | AccuAdmin123! | Admin |

### What Works in Demo Mode

- Full UI with dashboard, cases, analytics
- Mock chargeback cases with realistic data
- AI confidence scoring (simulated)
- PMS integration pages (read-only)
- Dispute adapter status views
- All 51 integration configurations visible
- Dispute outcome details (WON/LOST resolution data, arbitration filing)

### Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health

---

## Default Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@accudefend.com | AccuAdmin123! | Admin |
| demo@accudefend.com | Demo2024! | Admin |
| alok@accudefend.com | Alok@123 | Admin |
| manager.atlanta@accudefend.com | AccuAdmin123! | Manager |
| staff.atlanta@accudefend.com | AccuAdmin123! | Staff |

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | Create user (Admin) |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/logout` | Logout |

### Cases
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cases` | List cases |
| GET | `/api/cases/:id` | Get case details |
| POST | `/api/cases` | Create case |
| PATCH | `/api/cases/:id/status` | Update status |
| POST | `/api/cases/:id/analyze` | Run AI analysis |
| POST | `/api/cases/:id/arbitration` | File for arbitration |

### Evidence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/evidence/case/:id` | List evidence |
| POST | `/api/evidence/upload/:id` | Upload file |
| GET | `/api/evidence/:id/download` | Get download URL |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/stripe` | Stripe events |
| POST | `/api/webhooks/adyen` | Adyen events |
| POST | `/api/webhooks/shift4` | Shift4 events |
| POST | `/api/webhooks/elavon` | Elavon events |

### Disputes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/disputes` | List dispute companies |
| POST | `/api/disputes` | Add dispute company |
| PATCH | `/api/disputes/:id` | Update dispute company |
| DELETE | `/api/disputes/:id` | Remove dispute company |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all as read |

---

## AI Fraud Detection

The system analyzes chargebacks using a weighted scoring model:

### Confidence Score Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Reason Code | 40% | Historical win rates by dispute type |
| Evidence | 35% | Completeness of uploaded documentation |
| Fraud Indicators | 25% | Positive/negative signals |

### Recommendations

| Score | Recommendation | Action |
|-------|----------------|--------|
| 85-100% | AUTO_SUBMIT | Submit immediately |
| 70-84% | REVIEW_RECOMMENDED | Manual approval needed |
| 50-69% | GATHER_MORE_EVIDENCE | Missing documentation |
| 0-49% | UNLIKELY_TO_WIN | Consider accepting |

---

## Dispute Outcomes & Arbitration

### Resolution Data

When a dispute is resolved, AccuDefend tracks detailed outcome information:

**Won Cases:**
- Recovery amount and processor response code
- Win factors (specific evidence that won the case)
- Official processor/issuer statement

**Lost Cases:**
- Denial code and detailed explanation
- Evidence gaps (what was missing)
- Processor/issuer denial statement
- Arbitration eligibility and deadline

### Arbitration Workflow

For lost cases eligible for arbitration, AccuDefend provides:

1. **Review** - Case summary, arbitration fee, deadline, and terms
2. **Evidence & Narrative** - Upload additional documents and write arbitration narrative
3. **Confirm** - Review everything and file for arbitration

| Status | Description |
|--------|-------------|
| AVAILABLE | Arbitration can be filed |
| FILED | Arbitration has been submitted |
| IN_PROGRESS | Arbitration is being reviewed |
| WON | Arbitration ruled in hotel's favor |
| LOST | Arbitration ruled against hotel |

---

## Environment Variables

```env
# Application
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AWS S3
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
AWS_S3_BUCKET=accudefend-evidence

# Payment Processors
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
ADYEN_API_KEY=xxx
ADYEN_HMAC_KEY=xxx
```

---

## Tutorial & Help System

AccuDefend includes a built-in **interactive tutorial** and **contextual help system** to onboard new users and provide assistance.

### Features

| Feature | Description |
|---------|-------------|
| **Interactive Tutorial** | Step-by-step walkthrough for first-time users |
| **Help Panel** | Quick access to documentation and navigation |
| **Keyboard Shortcut** | Press `?` anywhere to open help |
| **Floating Help Button** | Always-visible help access in bottom-right corner |

### Tutorial Steps

1. **Welcome** - Introduction to AccuDefend
2. **Dashboard Overview** - Understanding metrics and KPIs
3. **Managing Cases** - Navigating and filtering cases
4. **Uploading Evidence** - Adding documentation to cases
5. **AI Analysis** - Understanding confidence scores
6. **PMS Integration** - Connecting to Property Management Systems
7. **Configuration** - Admin settings and thresholds
8. **Completion** - Ready to use the system

### Accessing Help

- **First-time users**: Tutorial auto-launches on first login
- **Returning users**: Click the `?` button or press `?` key
- **Restart tutorial**: Click "Take the Tutorial" in the Help panel

---

## Project Structure

```
accudefend/
├── backend/
│   ├── config/                # Database, Redis, S3 configuration
│   │   ├── database.js        # Prisma client setup
│   │   ├── redis.js           # Redis connection & session management
│   │   ├── s3.js              # AWS S3 configuration
│   │   └── storage.js         # Storage abstraction layer
│   ├── controllers/           # Request handlers
│   │   ├── documentsController.js     # Document processing
│   │   └── notificationsController.js # Notification handling
│   ├── middleware/            # Authentication middleware
│   │   └── auth.js            # JWT auth & role-based access
│   ├── prisma/                # Database schema and migrations
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.js            # Database seeding
│   ├── routes/                # API route handlers
│   │   ├── auth.js            # Login, register, refresh, logout
│   │   ├── cases.js           # Chargeback CRUD operations
│   │   ├── evidence.js        # File upload, download, deletion
│   │   ├── analytics.js       # Dashboard metrics, trends, reports
│   │   ├── admin.js           # User management, settings
│   │   ├── disputes.js        # Dispute company management
│   │   ├── notifications.js   # Notification panel & alerts
│   │   ├── pms.js             # PMS system integration
│   │   └── webhooks.js        # Payment processor webhooks
│   ├── services/              # Business logic
│   │   ├── fraudDetection.js  # AI fraud analysis engine
│   │   ├── aiDefenseConfig.js # AI defense configuration
│   │   ├── aiAgents.js        # AI agent orchestration
│   │   ├── backlog.js         # Backlog management
│   │   ├── integrations.js    # Third-party integrations
│   │   ├── pmsIntegration.js  # 30 PMS system adapters & connection handler
│   │   ├── pmsSyncService.js  # Two-way PMS data synchronization
│   │   └── disputeCompanies.js # 21 dispute & chargeback portal adapters
│   ├── data/                  # Development data
│   │   └── mockData.js        # Mock data for dev testing
│   ├── utils/                 # Helpers (logger, validators)
│   ├── uploads/               # Local file storage for evidence
│   ├── server.js              # Application entry point
│   ├── Dockerfile             # Production container
│   ├── Dockerfile.dev         # Development container (hot-reload)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── Layout.jsx           # Main layout with sidebar & nav
│   │   │   ├── Tutorial.jsx         # Tutorial & Help system
│   │   │   └── NotificationPanel.jsx # Notification dropdown panel
│   │   ├── hooks/             # React hooks
│   │   │   └── useAuth.jsx    # Authentication context & state
│   │   ├── pages/             # Page components (9 pages)
│   │   │   ├── Login.jsx              # Authentication
│   │   │   ├── Dashboard.jsx          # Main dashboard with metrics
│   │   │   ├── Cases.jsx              # Case list & management
│   │   │   ├── CaseDetail.jsx         # Individual case details with Outcome tab & Arbitration
│   │   │   ├── Analytics.jsx          # Reports & analytics
│   │   │   ├── Settings.jsx           # System configuration
│   │   │   ├── PMSIntegration.jsx     # PMS integrations
│   │   │   ├── DisputeIntegration.jsx # Dispute company integrations
│   │   │   └── Tutorial.jsx           # Dedicated tutorial page
│   │   └── utils/             # API client, helpers
│   │       ├── api.js         # API client & formatting utilities
│   │       └── helpers.js     # Helper functions
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── infrastructure/
│   └── aws/
│       ├── main.tf            # Main Terraform configuration
│       └── variables.tf       # Infrastructure variables
├── docker-compose.yml         # Production container orchestration
├── docker-compose.dev.yml     # Development environment setup
├── start-dev.sh               # Development startup script
├── start-production.sh        # Production startup script
├── start-frontend.sh          # Frontend-only startup script
├── AccuDefend_System_Design.md  # Full system documentation
├── DEPLOYMENT.md              # Deployment guide
└── README.md
```

---

## Cloud Infrastructure (AWS)

AccuDefend is deployed on AWS with multi-region architecture:

| Component | Service | Details |
|-----------|---------|---------|
| **Compute** | ECS Fargate | Auto-scaling containers |
| **Database** | Aurora PostgreSQL | Multi-AZ, read replicas |
| **Cache** | ElastiCache Redis | 3-node cluster |
| **Storage** | S3 | Cross-region replication |
| **CDN** | CloudFront | Global edge locations |
| **Secrets** | Secrets Manager | Encrypted credentials |

Infrastructure is managed with Terraform. See `/infrastructure/aws/` for configurations.

### Deployment Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| **Local** | http://localhost:3000 | Developer machines |
| **Development** | https://dev.accudefend.com | Dev server testing |
| **Staging** | https://staging.accudefend.com | QA/UAT testing |
| **Production** | https://app.accudefend.com | Live system |

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

---

## AI Defense Configuration

AccuDefend uses intelligent AI-powered defense strategies:

### Confidence Thresholds

| Score | Recommendation | Action |
|-------|----------------|--------|
| 85-100% | AUTO_SUBMIT | Submit defense immediately |
| 70-84% | REVIEW_RECOMMENDED | Human review needed |
| 50-69% | GATHER_MORE_EVIDENCE | Missing documentation |
| 0-49% | UNLIKELY_TO_WIN | Consider accepting loss |

### Evidence Weights

| Evidence Type | Weight | Priority |
|---------------|--------|----------|
| ID Scan | 20% | Required |
| Authorization Signature | 20% | Required |
| Checkout Signature | 15% | Recommended |
| Guest Folio | 15% | Required |
| Key Card Log | 10% | Recommended |
| Correspondence | 10% | Optional |
| CCTV Footage | 5% | Optional |
| Cancellation Policy | 5% | Conditional |

### Defense Strategies by Reason Code

| Category | Example Codes | Strategy |
|----------|---------------|----------|
| Fraud Claims | 10.1-10.5 (Visa), 4837 (MC) | ID + Signature required |
| Service Not Received | 13.1 (Visa), 4855 (MC) | Folio + Key card log |
| Not As Described | 13.3 (Visa), 4853 (MC) | Folio + Correspondence |
| Duplicate Charge | 13.6-13.7 (Visa) | Folio documentation |
| Cancelled Reservation | 13.2 (Visa), C18 (Amex) | Cancellation policy |

---

## PMS Integration (30 Systems)

AccuDefend integrates with **30 Property Management Systems** across 4 categories, all with full two-way sync (inbound: reservations, guest data; outbound: notes, flags, alerts).

### Enterprise PMS (15 systems)

| PMS | Auth Type | Two-Way Sync |
|-----|-----------|--------------|
| Oracle Opera Cloud | OAuth 2.0 | ✅ |
| Mews | API Key | ✅ |
| Cloudbeds | OAuth 2.0 | ✅ |
| AutoClerk | API Key | ✅ |
| Agilysys | OAuth 2.0 | ✅ |
| Infor | OAuth 2.0 | ✅ |
| Stayntouch | OAuth 2.0 | ✅ |
| RoomKey | API Key | ✅ |
| Maestro | API Key | ✅ |
| Hotelogix | API Key | ✅ |
| RMS Cloud | OAuth 2.0 | ✅ |
| Protel | Basic Auth | ✅ |
| eZee | API Key | ✅ |
| SIHOT | API Key | ✅ |
| innRoad | OAuth 2.0 | ✅ |

### Boutique & Independent PMS (6 systems)

| PMS | Auth Type | Two-Way Sync |
|-----|-----------|--------------|
| Little Hotelier | API Key | ✅ |
| Frontdesk Anywhere | API Key | ✅ |
| WebRezPro | API Key | ✅ |
| ThinkReservations | API Key | ✅ |
| ResNexus | API Key | ✅ |
| Guestline | OAuth 2.0 | ✅ |

### Vacation Rental PMS (4 systems)

| PMS | Auth Type | Two-Way Sync |
|-----|-----------|--------------|
| Guesty | OAuth 2.0 | ✅ |
| Hostaway | API Key | ✅ |
| Lodgify | API Key | ✅ |
| Escapia | OAuth 2.0 | ✅ |

### Brand-Specific PMS (5 systems, with loyalty program sync)

| PMS | Brand | Loyalty Program | Two-Way Sync |
|-----|-------|-----------------|--------------|
| Marriott GXP | Marriott | Marriott Bonvoy | ✅ |
| Hilton OnQ | Hilton | Hilton Honors | ✅ |
| Hyatt Opera | Hyatt | World of Hyatt | ✅ |
| IHG Concerto | IHG | IHG One Rewards | ✅ |
| Best Western | Best Western | Best Western Rewards | ✅ |

### Evidence Types from PMS

- Guest Folio (with all charges)
- Registration Card (signed)
- Payment Receipt (authorization)
- Digital Signature
- ID Document Scan
- Booking Confirmation

---

## Dispute & Chargeback Integration (21 Adapters)

AccuDefend connects to **21 dispute and chargeback portal adapters** across 4 categories, all with full two-way sync (inbound: dispute alerts, case updates; outbound: evidence submissions, outcomes).

### Hospitality Prevention Networks (3 adapters)

| Adapter | Type | Two-Way Sync |
|---------|------|--------------|
| Verifi (Visa CDRN/RDR) | Prevention Alert | ✅ |
| Ethoca (Mastercard) | Prevention Alert | ✅ |
| Merlink | Dispute Management | ✅ |

### Card Network Dispute Portals (4 adapters)

| Adapter | Network | Two-Way Sync |
|---------|---------|--------------|
| Visa VROL | Visa | ✅ |
| Mastercom | Mastercard | ✅ |
| AMEX Merchant | American Express | ✅ |
| Discover Dispute | Discover | ✅ |

### Merchant Processor Portals (9 adapters)

| Adapter | Type | Two-Way Sync |
|---------|------|--------------|
| Elavon | Processor | ✅ |
| Fiserv | Processor | ✅ |
| Worldpay | Processor | ✅ |
| Chase Merchant | Processor | ✅ |
| Global Payments | Processor | ✅ |
| TSYS | Processor | ✅ |
| Square | Processor | ✅ |
| Stripe | Processor | ✅ |
| Authorize.net | Gateway | ✅ |

### Third-Party Chargeback Services (5 adapters)

| Adapter | Type | Two-Way Sync |
|---------|------|--------------|
| Chargebacks911 | Chargeback Management | ✅ |
| Kount | Fraud Prevention | ✅ |
| Midigator | Chargeback Management | ✅ |
| Signifyd | Fraud Prevention | ✅ |
| Riskified | Fraud Prevention | ✅ |

---

## AI Agents

AccuDefend employs autonomous AI agents:

| Agent | Purpose | Schedule |
|-------|---------|----------|
| **Backlog Manager** | Creates/prioritizes backlog items | Daily |
| **Code Reviewer** | Reviews pull requests | Event-driven |
| **Security Scanner** | Scans for vulnerabilities | Daily |
| **Dispute Analyzer** | Analyzes chargeback cases | Event-driven |
| **Evidence Processor** | Processes evidence documents | Event-driven |

---

## Technical Backlog

Built-in backlog management system:

- **Epics** - Large features/initiatives
- **Backlog Items** - Bugs, features, tech debt
- **Sprints** - Time-boxed iterations
- **Dependencies** - Item relationships
- **AI-Generated Items** - Automatically created by AI agents

---

## Security

- **Authentication**: JWT with refresh token rotation
- **Password Hashing**: bcrypt (12 salt rounds)
- **Rate Limiting**: 100 req/15min (20 for auth)
- **Webhook Verification**: Signature validation for all processors
- **RBAC**: Property-level data isolation
- **Headers**: Helmet security middleware
- **Token Blacklisting**: Redis-backed revocation
- **Encryption**: KMS for data at rest, TLS 1.3 in transit

---

## Support

For technical support, contact:
- **Email**: support@accudefend.com

---

<div align="center">
  <p><strong>AccuDefend</strong></p>
  <p>AI-Powered Chargeback Defense Platform</p>
  <p>&copy; 2026 AccuDefend. All rights reserved.</p>
</div>
