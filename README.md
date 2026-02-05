# AccuDefend - Hotel Chargeback Defense System

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
- **Multi-Processor Integration** - Stripe, Adyen, Shift4, Elavon webhooks
- **Evidence Management** - AWS S3 storage with secure presigned URLs
- **Real-Time Dashboard** - Live metrics, trends, and case management
- **Role-Based Access** - Property-level data isolation with RBAC
- **Audit Trail** - Complete compliance logging for all actions

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
│  External Integrations:                                         │
│  ├── Payment Processors (Stripe, Adyen, Shift4, Elavon)        │
│  ├── AWS S3 (Evidence Storage)                                  │
│  └── PMS (Mews, Oracle Opera Cloud)                            │
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
git clone https://github.com/accudefend/chargeback-defense.git
cd chargeback-defense

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

## Default Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@accudefend.com | AccuAdmin123! | Admin |
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
6. **Configuration** - Admin settings and thresholds
7. **Completion** - Ready to use the system

### Accessing Help

- **First-time users**: Tutorial auto-launches on first login
- **Returning users**: Click the `?` button or press `?` key
- **Restart tutorial**: Click "Take the Tutorial" in the Help panel

---

## Project Structure

```
Hotel.Chargeback.Fraud_OMNI/
├── backend/
│   ├── config/           # Database, Redis, S3 configuration
│   ├── middleware/       # Authentication middleware
│   ├── prisma/           # Database schema and migrations
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic (fraud detection)
│   ├── utils/            # Helpers (logger, validators)
│   ├── server.js         # Application entry point
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   │   ├── Layout.jsx    # Main layout with sidebar
│   │   │   └── Tutorial.jsx  # Tutorial & Help system
│   │   ├── hooks/        # React hooks (useAuth)
│   │   ├── pages/        # Page components
│   │   └── utils/        # API client, helpers
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## Security

- **Authentication**: JWT with refresh token rotation
- **Password Hashing**: bcrypt (12 salt rounds)
- **Rate Limiting**: 100 req/15min (20 for auth)
- **Webhook Verification**: Signature validation for all processors
- **RBAC**: Property-level data isolation
- **Headers**: Helmet security middleware
- **Token Blacklisting**: Redis-backed revocation

---

## Support

For technical support, contact:
- **Email**: support@accudefend.com

---

<div align="center">
  <p><strong>AccuDefend</strong></p>
  <p>Hotel Chargeback Defense System</p>
  <p>&copy; 2025 AccuDefend. All rights reserved.</p>
</div>
