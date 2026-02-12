#!/bin/bash

# Hotel Chargeback Fraud Defense System - Frontend Startup Script

set -e

echo "=========================================="
echo "  Starting Frontend (React + Vite)"
echo "=========================================="
echo ""

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo ""
echo "Starting frontend development server..."
echo "Frontend will be available at: http://localhost:3000"
echo ""

npm run dev
