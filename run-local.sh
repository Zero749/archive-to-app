#!/bin/bash

# Run the local development server on port 8080

echo "🚀 Starting development server on port 8080..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Run the dev server with the local config
npm run dev -- --config vite.config.local.ts
