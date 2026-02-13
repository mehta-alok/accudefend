# AccuDefend - Deployment Guide

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Local Development](#local-development)
4. [Development Server (AWS)](#development-server-aws)
5. [Staging Environment](#staging-environment)
6. [Production Deployment](#production-deployment)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [Monitoring & Logging](#monitoring--logging)
9. [Troubleshooting](#troubleshooting)

---

## Overview

AccuDefend supports multiple deployment environments:

| Environment | Purpose | URL |
|-------------|---------|-----|
| **Local** | Developer machines | http://localhost:3000 |
| **Development** | Dev server for testing | https://dev.accudefend.com |
| **Staging** | QA and UAT testing | https://staging.accudefend.com |
| **Production** | Live production system | https://app.accudefend.com |

---

## Prerequisites

### Required Tools
- Node.js 20+ and npm 10+
- Docker and Docker Compose v2
- AWS CLI v2 (configured)
- PostgreSQL 16 client
- Terraform 1.x (for infrastructure provisioning)
- Git

### AWS Resources (for cloud deployment)
- AWS Account with appropriate IAM permissions
- ECR repository for Docker images
- ECS/EKS cluster
- RDS PostgreSQL instance
- ElastiCache Redis cluster
- S3 bucket for evidence storage
- CloudFront distribution (optional)
- Route 53 hosted zone

---

## Local Development

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/mehta-alok/accudefend.git
cd accudefend

# 2. Start infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# 3. Setup backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# 4. Setup frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Access Points
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Health**: http://localhost:8000/health

### Login Credentials
| Email | Password | Role |
|-------|----------|------|
| admin@accudefend.com | AccuAdmin123! | ADMIN |
| demo@accudefend.com | Demo2024! | ADMIN |
| alok@accudefend.com | Alok@123 | ADMIN |

### Using Docker Compose (Full Stack)

```bash
# Start all services
docker-compose up -d

# Run migrations
docker-compose run --rm migrate

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down
```

### Using Startup Scripts

```bash
# Development mode (with Docker health checks)
./start-dev.sh

# Production mode (with migrations and health verification)
./start-production.sh

# Frontend only
./start-frontend.sh
```

### Using Development Docker Compose

```bash
# Start dev environment with hot-reload
docker-compose -f docker-compose.dev.yml up -d

# Backend uses Dockerfile.dev with nodemon for auto-restart
# PostgreSQL 16 and Redis 7 are included
```

---

## Development Server (AWS)

### Step 1: Configure AWS Credentials

```bash
aws configure --profile accudefend-dev
# Enter your AWS Access Key, Secret Key, and region (us-east-1)
```

### Step 2: Create Environment File

```bash
cp backend/.env.example backend/.env.development
```

Edit `.env.development`:
```env
NODE_ENV=development
DEPLOY_ENV=development
API_BASE_URL=https://dev-api.accudefend.com
FRONTEND_URL=https://dev.accudefend.com

# AWS RDS
DATABASE_URL=postgresql://accudefend:YOUR_PASSWORD@accudefend-dev.xxxxx.us-east-1.rds.amazonaws.com:5432/accudefend_dev

# AWS ElastiCache
REDIS_URL=redis://accudefend-dev.xxxxx.cache.amazonaws.com:6379

# AWS S3
AWS_S3_BUCKET=accudefend-evidence-dev
```

### Step 3: Build and Push Docker Image

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t accudefend:dev .

# Tag for ECR
docker tag accudefend:dev YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:dev

# Push to ECR
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:dev
```

### Step 4: Deploy to ECS

```bash
# Update ECS service
aws ecs update-service \
  --cluster accudefend-dev \
  --service accudefend-api \
  --force-new-deployment \
  --region us-east-1

# Check deployment status
aws ecs describe-services \
  --cluster accudefend-dev \
  --services accudefend-api \
  --region us-east-1
```

### Step 5: Run Migrations

```bash
# Connect to bastion/jump host
ssh -i ~/.ssh/accudefend-dev.pem ec2-user@BASTION_IP

# Run migrations via ECS task
aws ecs run-task \
  --cluster accudefend-dev \
  --task-definition accudefend-migrate \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}"
```

---

## Staging Environment

### Step 1: Create Staging Environment File

```bash
cp backend/.env.example backend/.env.staging
```

Edit `.env.staging`:
```env
NODE_ENV=production
DEPLOY_ENV=staging
API_BASE_URL=https://staging-api.accudefend.com
FRONTEND_URL=https://staging.accudefend.com

# Use staging database
DATABASE_URL=postgresql://accudefend:YOUR_PASSWORD@accudefend-staging.xxxxx.us-east-1.rds.amazonaws.com:5432/accudefend_staging

# Enable feature flags for testing
FEATURE_AI_AUTO_SUBMIT=true
FEATURE_PMS_SYNC=true
```

### Step 2: Deploy to Staging

```bash
# Build staging image
docker build -t accudefend:staging .

# Push to ECR
docker tag accudefend:staging YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:staging
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:staging

# Deploy
aws ecs update-service \
  --cluster accudefend-staging \
  --service accudefend-api \
  --force-new-deployment
```

### Step 3: Run Smoke Tests

```bash
# Health check
curl https://staging-api.accudefend.com/health

# API test
curl -X POST https://staging-api.accudefend.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@accudefend.com","password":"Demo2024!"}'
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All tests passing on staging
- [ ] Database backup completed
- [ ] Rollback plan documented
- [ ] Team notified of deployment window
- [ ] Monitoring alerts configured

### Step 1: Create Production Environment File

```bash
cp backend/.env.example backend/.env.production
```

Edit `.env.production`:
```env
NODE_ENV=production
DEPLOY_ENV=production
API_BASE_URL=https://api.accudefend.com
FRONTEND_URL=https://app.accudefend.com

# Production database (Multi-AZ)
DATABASE_URL=postgresql://accudefend:SECURE_PASSWORD@accudefend-prod.cluster-xxxxx.us-east-1.rds.amazonaws.com:5432/accudefend_prod?ssl=true&sslmode=require

# Production Redis (cluster mode)
REDIS_URL=rediss://:PASSWORD@accudefend-prod.xxxxx.clustercfg.use1.cache.amazonaws.com:6379

# Production S3
AWS_S3_BUCKET=accudefend-evidence-prod

# Disable dangerous features
FEATURE_AI_AUTO_SUBMIT=false
LOG_LEVEL=info
```

### Step 2: Blue-Green Deployment

```bash
# Build production image
docker build -t accudefend:v1.0.0 .
docker build -t accudefend:latest .

# Push to ECR
docker tag accudefend:v1.0.0 YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:v1.0.0
docker tag accudefend:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:v1.0.0
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/accudefend:latest

# Deploy to green environment
aws ecs update-service \
  --cluster accudefend-prod \
  --service accudefend-api-green \
  --task-definition accudefend-api:LATEST \
  --force-new-deployment

# Wait for green to be healthy
aws ecs wait services-stable \
  --cluster accudefend-prod \
  --services accudefend-api-green

# Switch traffic (update ALB target group)
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:us-east-1:xxx:listener/app/accudefend-prod/xxx/xxx \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:xxx:targetgroup/accudefend-green/xxx
```

### Step 3: Post-Deployment Verification

```bash
# Health check
curl https://api.accudefend.com/health

# Verify version
curl https://api.accudefend.com/api | jq '.version'

# Check logs
aws logs tail /ecs/accudefend-prod --follow

# Monitor metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_2XX_Count \
  --dimensions Name=LoadBalancer,Value=app/accudefend-prod/xxx \
  --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Sum
```

### Rollback Procedure

```bash
# Switch back to blue environment
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:us-east-1:xxx:listener/app/accudefend-prod/xxx/xxx \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:xxx:targetgroup/accudefend-blue/xxx

# Or rollback to previous task definition
aws ecs update-service \
  --cluster accudefend-prod \
  --service accudefend-api \
  --task-definition accudefend-api:PREVIOUS_VERSION
```

---

## Infrastructure Provisioning (Terraform)

AccuDefend's AWS infrastructure is defined as code using Terraform in `infrastructure/aws/`.

### Provision Infrastructure

```bash
cd infrastructure/aws

# Initialize Terraform
terraform init

# Plan changes
terraform plan -var="environment=production" -var="aws_region=us-east-1"

# Apply changes
terraform apply -var="environment=production" -var="aws_region=us-east-1"
```

### Infrastructure Components Provisioned

| Resource | Service | Details |
|----------|---------|---------|
| Networking | VPC | Multi-AZ with public/private subnets |
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

---

## CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy AccuDefend

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: accudefend

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd backend && npm ci && npm test
      - run: cd frontend && npm ci && npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG

  deploy-dev:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: development
    steps:
      - name: Deploy to Dev
        run: |
          aws ecs update-service \
            --cluster accudefend-dev \
            --service accudefend-api \
            --force-new-deployment

  deploy-prod:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Deploy to Production
        run: |
          aws ecs update-service \
            --cluster accudefend-prod \
            --service accudefend-api \
            --force-new-deployment
```

---

## Monitoring & Logging

### CloudWatch Alarms

```bash
# Create alarm for high error rate
aws cloudwatch put-metric-alarm \
  --alarm-name "AccuDefend-HighErrorRate" \
  --alarm-description "Alert when error rate exceeds 5%" \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:xxx:accudefend-alerts
```

### Log Groups

- `/ecs/accudefend-api` - API logs
- `/ecs/accudefend-frontend` - Frontend logs
- `/aws/rds/instance/accudefend-prod/postgresql` - Database logs

---

## Troubleshooting

### Common Issues

**Issue: Database connection failed**
```bash
# Check security groups allow connection
aws ec2 describe-security-groups --group-ids sg-xxx

# Test connection
psql -h accudefend-prod.xxx.rds.amazonaws.com -U accudefend -d accudefend_prod
```

**Issue: Container keeps restarting**
```bash
# Check ECS task logs
aws logs get-log-events \
  --log-group-name /ecs/accudefend-api \
  --log-stream-name ecs/accudefend-api/xxx
```

**Issue: Redis connection timeout**
```bash
# Check ElastiCache endpoint
aws elasticache describe-cache-clusters --cache-cluster-id accudefend-prod
```

---

## Support

- **Documentation**: https://docs.accudefend.com
- **Issues**: https://github.com/mehta-alok/accudefend/issues
- **Email**: support@accudefend.com
