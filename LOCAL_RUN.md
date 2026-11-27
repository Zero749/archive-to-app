# 🖥️ Running Locally on Port 8080

## Quick Start

Run the development server on port 8080:

```bash
./run-local.sh
```

Or manually:

```bash
npm run dev -- --config vite.config.local.ts
```

## What This Does

- Runs the app on **port 8080** instead of the default port
- Uses the local Vercel configuration
- Includes all the new brush system code
- Allows you to test the brush rendering before deploying to Vercel

## Verification

Once the server is running, you can:

1. **Open your browser** to: http://localhost:8080
2. **Test the brush system** - Try drawing with different brushes
3. **Check for square rendering** - Verify the brush looks circular, not square
4. **Test all features** - Pressure, tilt, grain, etc.

## Files Used

- `vite.config.local.ts` - Custom config for port 8080
- `run-local.sh` - Quick start script
- `package.json` - Dependencies and scripts

## Troubleshooting

### Port Already in Use

If port 8080 is already in use:

```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Then run again
./run-local.sh
```

### Dependencies Not Installed

```bash
npm install
./run-local.sh
```

### Build Errors

```bash
# Clear cache and reinstall
rm -rf node_modules .vite
npm install
./run-local.sh
```

## Comparison

### Local (Port 8080)
- ✅ Shows the new brush system
- ✅ Uses updated code
- ✅ Allows testing before deployment

### Vercel (Production)
- ⚠️ Shows old glitchy brush system
- ⚠️ Uses cached/old code
- ⚠️ Will be fixed after verification

## Testing Checklist

Before fixing Vercel, verify:

- [ ] Brush renders as circle, not square
- [ ] Pressure sensitivity works
- [ ] Tilt sensitivity works
- [ ] Grain renders correctly
- [ ] All 17 default brushes work
- [ ] No rendering glitches

## Next Steps

1. ✅ Run the local server on port 8080
2. ✅ Test the brush system
3. ✅ Verify it looks correct (circular, not square)
4. ✅ Report any issues
5. ✅ Then we'll fix Vercel

---

**Status**: Ready to run on port 8080
**Purpose**: Verify new brush system before fixing Vercel
