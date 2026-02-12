#!/bin/bash

# Hotel Chargeback Fraud Defense System - Development Startup Script
# This script starts the full development environment

set -e

echo "=========================================="
echo "  Hotel Chargeback Defense System"
echo "  Development Environment Startup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

echo -e "${GREEN}Docker is running...${NC}"

# Start backend services with Docker
echo ""
echo -e "${YELLOW}Starting backend services (PostgreSQL, Redis, API)...${NC}"
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# Check if backend is ready
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}Backend API is ready!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}Backend is still starting up... Check logs with: docker-compose -f docker-compose.dev.yml logs -f api${NC}"
    fi
    sleep 2
done

echo ""
echo "=========================================="
echo -e "${GREEN}Backend Services Started!${NC}"
echo "=========================================="
echo ""
echo "  PostgreSQL: localhost:5432"
echo "  Redis:      localhost:6379"
echo "  Backend:    http://localhost:8000"
echo ""
echo "=========================================="
echo -e "${YELLOW}To start the Frontend:${NC}"
echo ""
echo "  cd frontend && npm install && npm run dev"
echo ""
echo "  Frontend will be available at: http://localhost:3000"
echo "=========================================="
echo ""
echo "Useful commands:"
echo "  View logs:      docker-compose -f docker-compose.dev.yml logs -f"
echo "  Stop services:  docker-compose -f docker-compose.dev.yml down"
echo "  Restart:        docker-compose -f docker-compose.dev.yml restart"
echo ""
