# Deployment Guide

This project is automatically deployed to Vercel when you push to GitHub.

## 🚀 Automatic Deployment

Whenever you push code to the `main` branch, Vercel will automatically deploy your application.

### How to Deploy

1. **Make your changes**
   ```bash
   # Edit your files...
   ```

2. **Commit and push**
   ```bash
   git add .
   git commit -m "Your commit message"
   git push origin main
   ```

3. **Wait for deployment**
   - Check the GitHub Actions workflow status
   - Or visit your Vercel dashboard
   - The deployment will be live within 2-3 minutes

## 📋 Manual Deployment

If you need to deploy manually:

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (includes preview)
vercel

# Deploy to production
vercel --prod
```

## 🔧 Deployment Configuration

### Vercel Configuration

- **Framework**: Static Site Generation (SSG)
- **Build Command**: `npm run build`
- **Output Directory**: `.output/public`
- **Environment**: Production

### Build Process

1. Run `npm run build`
2. Generate static files in `.output/public`
3. Deploy to Vercel CDN

### Environment Variables

No environment variables are required for this project.

## 🌐 Preview Deployments

Each push to GitHub creates a preview deployment:

1. Push to a feature branch
2. Vercel creates a preview URL
3. Share the preview URL for testing
4. Merge to main to deploy to production

## 📊 Deployment Status

You can check deployment status at:
- **GitHub**: https://github.com/Zero749/archive-to-app/actions
- **Vercel**: https://vercel.com/dashboard

## 🔄 Deployment Workflow

```
Code Push → GitHub Trigger → Vercel Build → Deployment → Live
```

### Steps

1. **Code Changes**: Make your changes locally
2. **Commit**: `git commit -m "message"`
3. **Push**: `git push origin main`
4. **GitHub Actions**: Build and test
5. **Vercel**: Deploy to production
6. **Live**: App is available at your Vercel URL

## 🐛 Troubleshooting

### Deployment Fails

1. **Check Build Output**
   ```bash
   npm run build
   ```

2. **Check for Errors**
   - Review the build logs in GitHub Actions
   - Check the Vercel deployment logs

3. **Common Issues**
   - Missing dependencies: `npm install`
   - Build errors: Check console output
   - Git issues: Ensure you're on the main branch

### Local Build Issues

```bash
# Clear cache and rebuild
rm -rf node_modules .output
npm install
npm run build
```

### Deployment Issues

1. **Check Git Status**
   ```bash
   git status
   ```

2. **Verify Branch**
   ```bash
   git branch
   ```

3. **Check Remote URL**
   ```bash
   git remote -v
   ```

## 📝 Deployment Checklist

Before deploying, ensure:

- ✅ All changes are committed
- ✅ Tests pass (`npm test`)
- ✅ Build succeeds (`npm run build`)
- ✅ No breaking changes
- ✅ Documentation is updated

## 🎯 Deployment URLs

After deployment, you'll get a URL like:
```
https://archive-to-app.vercel.app
```

## 🔄 Continuous Deployment

This project uses continuous deployment:

- Every push to `main` triggers a deployment
- Every pull request creates a preview deployment
- Deployments are automatic and fast

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI](https://vercel.com/docs/cli)
- [Deployment Settings](https://vercel.com/docs/projects/project-configuration)

## 🆘 Need Help?

If deployment fails:

1. Check the [GitHub Actions logs](https://github.com/Zero749/archive-to-app/actions)
2. Check the [Vercel logs](https://vercel.com/dashboard)
3. Review the [deployment guide](https://vercel.com/docs/deployments/overview)

---

**Last Updated**: November 27, 2026
**Status**: ✅ Automated Deployment Active
