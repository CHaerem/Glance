#!/bin/bash

# Test runner script for Glance Server
# Usage: ./scripts/run-tests.sh [test-type]
# test-type: unit, integration, coverage, all (default)

set -e

# Ensure we're in the right directory
cd "$(dirname "$0")/../server"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required to run tests"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

TEST_TYPE=${1:-"all"}

case $TEST_TYPE in
    "unit")
        echo "🧪 Running unit tests..."
        npm test -- --testPathPattern="image-processing|eink-conversion"
        ;;
    "integration")
        echo "🔗 Running integration tests..."
        npm test -- --testPathPattern="api|full-pipeline"
        ;;
    "coverage")
        echo "📊 Running tests with coverage..."
        npm run test:coverage
        echo ""
        echo "📈 Coverage report generated in coverage/lcov-report/index.html"
        ;;
    "watch")
        echo "👀 Running tests in watch mode..."
        npm run test:watch
        ;;
    "all"|*)
        echo "🚀 Running full test suite..."
        npm run test:ci
        echo ""
        echo "✅ All tests completed successfully!"
        echo "📊 Coverage report: coverage/lcov-report/index.html"
        ;;
esac

echo ""
echo "🎉 Test run completed!"