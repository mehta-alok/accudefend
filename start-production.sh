#!/bin/bash

# Hotel Chargeback Fraud Defense System - Production Startup Script
# This starts the full stack with Docker

set -e

echo "=========================================="
echo "  Hotel Chargeback Defense System"
echo "  Production Environment Startup"
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

# Build and start all services
echo ""
echo -e "${YELLOW}Building and starting all services...${NC}"
docker-compose up --build -d

# Run database migrations
echo ""
echo -e "${YELLOW}Running database migrations...${NC}"
docker-compose --profile setup up migrate

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check health
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}Backend API is healthy!${NC}"
        break
    fi
    sleep 2
done

echo ""
echo "=========================================="
echo -e "${GREEN}All Services Started!${NC}"
echo "=========================================="
echo ""
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:8000"
echo "  PostgreSQL: localhost:5432"
echo "  Redis:      localhost:6379"
echo ""
echo "  Health:     http://localhost:8000/health"
echo ""
echo "=========================================="
echo ""
echo "Default login credentials (DEMO_MODE):"
echo "  Email:    manager@hotel.com"
echo "  Password: password123"
echo ""
echo "Useful commands:"
echo "  View logs:      docker-compose logs -f"
echo "  Stop services:  docker-compose down"
echo "  Restart:        docker-compose restart"
echo ""
