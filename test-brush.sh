#!/bin/bash

echo "🧪 Testing Brush System on Port 8080"
echo "===================================="
echo ""

# Check if server is running
echo "1. Checking if server is running..."
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "   ✅ Server is running"
else
    echo "   ❌ Server is not running"
    echo "   Starting server..."
    npm run dev -- --config vite.config.local.ts &
    sleep 5
fi

echo ""
echo "2. Testing server response..."
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "   ✅ Server is responding"
else
    echo "   ❌ Server is not responding"
    exit 1
fi

echo ""
echo "3. Opening browser..."
echo "   URL: http://localhost:8080"
echo ""
echo "4. Please test the brush system:"
echo "   - Open http://localhost:8080 in your browser"
echo "   - Select a brush (try Pencil or Ink
echo "   - Draw on the canvas"
echo "   - Check if the brush is circular (not square!)"
echo "   - Test pressure sensitivity"
echo "   - Test tilt sensitivity"
echo ""

echo "5. Report your results:"
echo "   - Is the brush circular? (Yes/No)"
echo "   - Does pressure work? (Yes/No)"
echo "   - Does tilt work? (Yes/No)"
echo "   - Any other issues?"
echo ""

echo "✅ Server is ready for testing!"
