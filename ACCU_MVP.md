# AccuDefend MVP - Product Document

**Version:** 2.0
**Last Updated:** February 2026
**Status:** In Production
**Document Owner:** Aalok Mehta

---

## Executive Summary

AccuDefend (formerly Chargeback Defense MVP) is an enterprise-grade, AI-powered platform designed to help hotels defend against credit card chargebacks by automatically collecting evidence, generating dispute packages, and submitting responses to payment processors. The system reduces chargeback losses by 60-80% through automation and AI-powered decision making.

### Key Metrics

| Metric | Target |
|--------|--------|
| Win Rate | 85%+ |
| Time Savings | 95% reduction (from 2-3 hours to 5 minutes per case) |
| Response Time | Automated submission within 2-5 minutes |
| ROI | 10-15x return for properties with 50+ chargebacks annually |

---

## Product Overview

### Core Value Proposition

Automatically win chargebacks without lifting a finger by collecting the right evidence at check-in and instantly submitting comprehensive dispute packages when chargebacks occur.

### Target Users

- Hotel General Managers
- Revenue Managers
- Front Desk Managers
- Accounting/Finance Teams
- Property Management Companies (multi-property operators)

### Problem Being Solved

Hotels lose $5,000-$50,000+ annually to chargebacks due to:
- Missing evidence (not collected at check-in)
- Missed deadlines (10-30 day response window)
- Manual complexity (2-3 hours per dispute)
- Staff turnover and training gaps
- Inconsistent processes across properties

---

## Current Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18, Vite 5, Tailwind CSS 3 | 9 pages, 3 components |
| **Backend** | Node.js 20, Express 4, Prisma 5 | 9 route files, 8 services |
| **Database** | PostgreSQL 16 | Via Prisma ORM |
| **Cache** | Redis 7 | Sessions, rate limiting |
| **Storage** | AWS S3 | Evidence files with presigned URLs |
| **Auth** | JWT | Access (15m) + Refresh (7d) tokens |
| **Validation** | Zod 3 | Input validation schemas |
| **Logging** | Winston 3 | Structured logging |
| **Infrastructure** | AWS (ECS Fargate, Aurora, ElastiCache, CloudFront) | Multi-region with Terraform IaC |
| **DevOps** | Docker, Docker Compose, GitHub Actions | Production + Dev containers |

---

## Implemented Feature Set

### 0. User Authentication & Provider Integration

**Status:** Implemented

- JWT token authentication with refresh token rotation
- Role-based access control (Admin, Manager, Staff, Read-Only)
- Property-level data isolation
- bcrypt password hashing (12 salt rounds)
- Rate limiting: 100 req/15min general, 20 req/15min for auth

**Supported Provider Categories:**
- **Payment Processors:** Stripe, Adyen, Shift4, Elavon
- **PMS Systems:** Oracle Opera Cloud, Mews, Cloudbeds, AutoClerk, protel, StayNTouch, Apaleo, innRoad, WebRezPro, RoomMaster, Little Hotelier, RoomKeyPMS (12+ systems)
- **Dispute Companies:** Merlink (2-way sync)

**Default Credentials:**

| Email | Password | Role |
|-------|----------|------|
| admin@accudefend.com | AccuAdmin123! | Admin |
| demo@accudefend.com | Demo2024! | Admin |
| alok@accudefend.com | Alok@123 | Admin |
| manager.atlanta@accudefend.com | AccuAdmin123! | Manager |
| staff.atlanta@accudefend.com | AccuAdmin123! | Staff |

### 1. Automated Evidence Collection

**Status:** Implemented

- Integrates with 12+ hotel PMS systems
- Automatically captures required evidence during check-in
- Stores evidence linked to reservation number in AWS S3
- Supports presigned URLs for secure download

**Evidence Types Collected:**
- Government-issued ID scan
- Credit card authorization signature
- Check-out signature
- Itemized guest folio
- Key card access logs
- CCTV footage
- Correspondence
- Incident reports
- Damage photos
- Police reports
- Cancellation policies

### 2. Payment Processor Webhooks

**Status:** Implemented (all 4 processors)

| Processor | Webhook Events | Endpoint |
|-----------|----------------|----------|
| Stripe | charge.dispute.created, updated, closed | `/api/webhooks/stripe` |
| Adyen | CHARGEBACK, CHARGEBACK_REVERSED | `/api/webhooks/adyen` |
| Shift4 | dispute.opened, dispute.closed | `/api/webhooks/shift4` |
| Elavon | chargeback_notification | `/api/webhooks/elavon` |

### 3. AI Confidence Scoring

**Status:** Implemented

Weighted scoring model calculating confidence score (0-100):

| Component | Weight | Description |
|-----------|--------|-------------|
| Reason Code Base | 40% | Historical win rates by dispute type |
| Evidence Completeness | 35% | Uploaded documentation coverage |
| Fraud Indicators | 25% | Positive/negative signal adjustments (±25 points) |

**Recommendation Thresholds:**

| Score | Recommendation | Action |
|-------|----------------|--------|
| 85-100% | AUTO_SUBMIT | Submit immediately |
| 70-84% | REVIEW_RECOMMENDED | Manual approval needed |
| 50-69% | GATHER_MORE_EVIDENCE | Missing documentation |
| 0-49% | UNLIKELY_TO_WIN | Consider accepting |

### 4. Evidence Package Generation

**Status:** Implemented

- PDF evidence package generation
- Processor-specific formatting
- Evidence type weighting system
- S3 storage with cross-region replication

### 5. Automated Submission

**Status:** Implemented

- API submission to all 4 payment processors
- Real-time status tracking
- Confirmation notifications
- Outcome webhook processing

### 6. Dashboard & Reporting

**Status:** Implemented

**Frontend Pages (9 total):**

| Page | Description |
|------|-------------|
| Dashboard | Real-time KPIs, metrics, charts, urgent cases |
| Cases | Case list with search, filter, and status management |
| CaseDetail | Individual case view with evidence, timeline, AI analysis |
| Analytics | Trends, win rates by reason code, property comparison |
| Settings | AI configuration, email notifications, storage settings |
| PMSIntegration | Connect/manage 12+ PMS systems |
| DisputeIntegration | Dispute company management with Merlink 2-way sync |
| Tutorial | Dedicated tutorial and help page |
| Login | Authentication with provider selection |

**Frontend Components:**

| Component | Description |
|-----------|-------------|
| Layout | Main layout with sidebar navigation |
| Tutorial | Interactive onboarding, help button, help panel |
| NotificationPanel | Real-time notification dropdown with alerts |

### 7. Dispute Company Integration (NEW)

**Status:** Implemented

- Merlink 2-way sync for dispute management
- Dispute company CRUD via `/api/disputes` endpoints
- Automated status synchronization

### 8. Notifications System (NEW)

**Status:** Implemented

- Real-time notification dropdown panel
- Mark as read/unread functionality
- Mark all as read
- Notification alerts via `/api/notifications` endpoints

### 9. Technical Backlog System

**Status:** Implemented

- Epic/Sprint/Item hierarchy
- AI-generated backlog items
- Dependency tracking
- Sprint velocity calculations

### 10. AI Agents

**Status:** Implemented

| Agent | Purpose | Schedule |
|-------|---------|----------|
| Backlog Manager | Create/prioritize backlog items | Daily |
| Code Reviewer | Review pull requests | Event-driven |
| Security Scanner | Scan for vulnerabilities | Daily |
| Dispute Analyzer | Analyze chargeback cases | Event-driven |
| Evidence Processor | Process evidence documents | Event-driven |

### 11. Interactive Tutorial & Help System

**Status:** Implemented

- Auto-launches for first-time users
- 8-step guided walkthrough
- Keyboard shortcut (`?` key) for quick access
- Floating help button (bottom-right)
- Contextual help panel with navigation

---

## Current API Endpoints

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
| GET | `/api/cases` | List cases (paginated) |
| GET | `/api/cases/:id` | Get case details |
| POST | `/api/cases` | Create case |
| PATCH | `/api/cases/:id/status` | Update status |
| POST | `/api/cases/:id/analyze` | Run AI analysis |

### Evidence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/evidence/case/:id` | List evidence |
| POST | `/api/evidence/upload/:id` | Upload file |
| GET | `/api/evidence/:id/download` | Get download URL |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard` | Dashboard metrics |
| GET | `/api/analytics/trends` | Historical trends |
| GET | `/api/analytics/by-reason` | Win rate by reason code |
| GET | `/api/analytics/by-property` | Property comparison |

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

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List users |
| PATCH | `/api/admin/users/:id` | Update user |
| GET | `/api/admin/properties` | List properties |
| GET | `/api/admin/config` | Get system config |
| PUT | `/api/admin/config` | Update config |
| GET | `/api/admin/storage/status` | Storage health |

### PMS
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pms` | List PMS connections |
| POST | `/api/pms/connect` | Connect PMS system |
| POST | `/api/pms/:id/sync` | Trigger sync |
| DELETE | `/api/pms/:id` | Disconnect PMS |

---

## Project Structure

```
accudefend/
├── backend/
│   ├── config/                # Database, Redis, S3 configuration
│   ├── controllers/           # Document & notification handlers
│   ├── middleware/            # JWT auth & RBAC
│   ├── routes/                # 9 API route files
│   ├── services/              # 8 business logic services
│   ├── data/                  # Mock data for development
│   ├── utils/                 # Logger, validators
│   ├── prisma/                # Schema & seeding
│   ├── uploads/               # Local file storage
│   ├── Dockerfile             # Production container
│   ├── Dockerfile.dev         # Dev container (hot-reload)
│   └── server.js              # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/        # Layout, Tutorial, NotificationPanel
│   │   ├── pages/             # 9 page components
│   │   ├── hooks/             # useAuth
│   │   └── utils/             # api.js, helpers.js
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── infrastructure/
│   └── aws/                   # Terraform (main.tf, variables.tf)
├── docker-compose.yml         # Production orchestration
├── docker-compose.dev.yml     # Development environment
├── start-dev.sh               # Dev startup script
├── start-production.sh        # Production startup script
└── start-frontend.sh          # Frontend-only startup
```

---

## Cloud Infrastructure (AWS)

| Component | Service | Configuration |
|-----------|---------|---------------|
| Compute | ECS Fargate | Backend (3 tasks), Frontend (2 tasks), AI Agent (2 tasks) |
| Database | Aurora PostgreSQL | Multi-AZ, 3 instances (1 writer, 2 readers) |
| Cache | ElastiCache Redis | 3-node cluster with automatic failover |
| Storage | S3 | Cross-region replication, lifecycle policies |
| CDN | CloudFront | Global edge locations |
| DNS | Route 53 | Health checks, failover routing |
| Load Balancer | ALB | SSL termination, path-based routing |
| Secrets | Secrets Manager | Encrypted credentials, automatic rotation |
| Queues | SQS | Webhook processing, AI analysis |
| Notifications | SNS | Alerts and monitoring |
| Monitoring | CloudWatch | Alarms for error rates, latency, health |

### Deployment Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Local | http://localhost:3000 | Developer machines |
| Development | https://dev.accudefend.com | Dev server testing |
| Staging | https://staging.accudefend.com | QA/UAT testing |
| Production | https://app.accudefend.com | Live system |

---

## User Workflows

### Workflow 1: Check-in (Evidence Collection)
1. Guest arrives at front desk
2. Front desk agent processes check-in in PMS
3. Agent scans guest ID with mobile device or scanner
4. Guest signs authorization on signature pad or tablet
5. Evidence automatically uploaded and linked to reservation
6. Check-in completes normally

**Time Added to Check-in:** 30-45 seconds

### Workflow 2: Automatic Chargeback Response
1. Guest files chargeback with their bank
2. Payment processor sends webhook to AccuDefend
3. System automatically (within 2-5 minutes):
   - Creates case record
   - Retrieves evidence from storage
   - Calculates AI confidence score
   - Generates PDF evidence package
   - Submits to processor via API (if confidence >= 85%)
4. Hotel receives notification: "Chargeback auto-submitted"
5. System receives outcome webhook and updates dashboard

**Total Hotel Staff Time:** 0 minutes (fully automated)

### Workflow 3: Manual Review (Low Confidence Cases)
1. Chargeback received with confidence score < 85%
2. Alert sent to hotel manager via notification panel
3. Manager reviews case in dashboard
4. Manager options: Submit anyway / Request more evidence / Accept loss
5. System processes accordingly

**Total Hotel Staff Time:** 5-10 minutes

---

## Security

| Layer | Protection |
|-------|------------|
| Transport | HTTPS/TLS 1.3 |
| Authentication | JWT with refresh token rotation |
| Passwords | bcrypt (12 salt rounds) |
| API | Rate limiting (100 req/15min, 20 for auth) |
| Files | S3 server-side encryption (AES-256) |
| Database | Prepared statements via Prisma ORM |
| Input | Zod validation schemas |
| Headers | Helmet security middleware |
| Token Revocation | Redis-backed blacklisting |
| Secrets | AWS Secrets Manager with automatic rotation |
| CORS | Whitelist origins |

---

## Pricing Model (Proposed)

| Tier | Price | Chargebacks | Properties | Target |
|------|-------|-------------|-----------|--------|
| Starter | $299/mo | Up to 10/mo | 1 | Small independent hotels |
| Professional | $599/mo | Up to 30/mo | Up to 3 | Boutique hotel groups |
| Enterprise | $999/mo+ | Unlimited | Unlimited | Large chains, management companies |

**Alternative:** Performance-based pricing (20% of recovered amounts)

---

## Success Metrics (Projected)

### 150-Room Independent Hotel
| Metric | Before | After |
|--------|--------|-------|
| Monthly Losses | $8,100 | $1,620 (80% reduction) |
| Win Rate | 15% | 82% |
| Staff Time/Case | 3-4 hours | 5 minutes |
| ROI | - | 10.8x |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 28, 2026 | Initial MVP document |
| 2.0 | February 2026 | Updated to reflect implemented system: added dispute integrations, notifications, 12+ PMS systems, full API endpoints, current tech stack (React 18, Node.js 20, PostgreSQL 16, Terraform IaC), cloud infrastructure details |

---

*© 2026 AccuDefend. All rights reserved.*
