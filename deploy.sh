#!/bin/bash

# Deploy script for Archive-To-App
# This script pushes changes to GitHub and triggers Vercel deployment

set -e

echo "🚀 Starting deployment process..."

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Please run this script from the project root."
  exit 1
fi

# Check if git is initialized
if [ ! -d ".git" ]; then
  echo "❌ Error: Git repository not initialized."
  exit 1
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "⚠️  Vercel CLI not found. Installing..."
  npm install -g vercel
fi

# Check if logged in to Vercel
if ! vercel whoami &> /dev/null; then
  echo "❌ Error: Not logged in to Vercel. Please run 'vercel login' first."
  exit 1
fi

# Get the current branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "📦 Branch: $BRANCH"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  There are uncommitted changes. Committing them first..."
  git add .
  git commit -m "chore: Auto-commit before deployment"
fi

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin "$BRANCH"

# Deploy to Vercel
echo "🌐 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo "🌐 Your app is now live at the Vercel URL provided above."
