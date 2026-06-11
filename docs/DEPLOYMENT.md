# Deployment Guide

## Overview

This guide covers deployment of CCP Analyzer DZ to production environments.

## Pre-Deployment Checklist

### Environment Preparation
- [ ] Production domain secured
- [ ] SSL certificates obtained
- [ ] Database provider selected and account created
- [ ] Backend hosting provider selected
- [ ] Frontend hosting provider selected
- [ ] Environment variables documented
- [ ] Security review completed

### Code Preparation
- [ ] All tests passing
- [ ] No console errors or warnings
- [ ] Git repository clean
- [ ] Versions locked in package.json
- [ ] Build tested locally
- [ ] Environment variables set correctly

### Infrastructure Setup
- [ ] PostgreSQL database created
- [ ] Database backups configured
- [ ] Monitoring alerts set up
- [ ] CDN configured (optional)
- [ ] SSL certificates installed

## Database Setup

### PostgreSQL on Neon

1. Sign up at https://neon.tech
2. Create new project
3. Note connection string:
   ```
   postgresql://[user]:[password]@[host]/[dbname]
   ```

### PostgreSQL on Supabase

1. Sign up at https://supabase.com
2. Create new project
3. Go to Database settings
4. Copy connection string

### PostgreSQL Self-Hosted

1. Install PostgreSQL 14+
2. Create database:
   ```sql
   CREATE DATABASE ccp_analyzer;
   ```
3. Create user:
   ```sql
   CREATE USER ccp_user WITH PASSWORD 'strong-password-here';
   GRANT ALL PRIVILEGES ON DATABASE ccp_analyzer TO ccp_user;
   ```

### Initial Database Setup

1. Set `DATABASE_URL` environment variable
2. Run migrations:
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

## Backend Deployment

### Option 1: Render

1. **Connect Repository**
   - Sign up at https://render.com
   - Connect GitHub repository
   - Select `backend` directory as root

2. **Configure Build**
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment: Node

3. **Environment Variables**
   ```
   DATABASE_URL=postgresql://...
   CLIENT_HASH_SALT=<32-char-random-string>
   ACCESS_TOKEN_SECRET=<32-char-random-string>
   PORT=3001
   NODE_ENV=production
   FRONTEND_URL=https://your-domain.com
   ```

4. **Deploy**
   - Click Deploy
   - Monitor build logs
   - Test health endpoint

### Option 2: Railway

1. **Connect Repository**
   - Sign up at https://railway.app
   - New project → Deploy from GitHub
   - Select repository

2. **Configure Service**
   - Select Node.js environment
   - Set root directory to `backend`
   - Add environment variables

3. **Deploy**
   ```bash
   railway up
   ```

### Option 3: VPS (Ubuntu 20.04+)

1. **SSH Access**
   ```bash
   ssh root@your-vps-ip
   ```

2. **Install Dependencies**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo apt-get install -y git
   ```

3. **Clone Repository**
   ```bash
   cd /opt
   git clone https://github.com/your-org/ccp-analyzer.git
   cd ccp-analyzer/backend
   ```

4. **Install & Build**
   ```bash
   npm install
   npm run build
   npm run prisma:generate
   npx prisma migrate deploy
   ```

5. **Create `.env`**
   ```bash
   nano .env
   # Add all environment variables
   ```

6. **Install PM2**
   ```bash
   sudo npm install -g pm2
   pm2 start "npm start" --name "ccp-api"
   pm2 startup
   pm2 save
   ```

7. **Configure Nginx**
   ```nginx
   server {
       listen 80;
       server_name api.ccpanalyzer.dz;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

8. **SSL Certificate**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d api.ccpanalyzer.dz
   ```

### Backend Health Check

```bash
curl https://api.ccpanalyzer.dz/api/ccp/result?token=invalid
# Should return 404 or error, not 5xx
```

## Frontend Deployment

### Option 1: Vercel

1. **Connect Repository**
   - Sign up at https://vercel.com
   - Import GitHub repository
   - Select `frontend` directory

2. **Environment Variables**
   ```
   VITE_API_URL=https://api.ccpanalyzer.dz/api
   ```

3. **Deploy**
   - Automatic deployment on push to main
   - Preview deployments for PR
   - Production domain setup

### Option 2: Netlify

1. **Connect Repository**
   - Sign up at https://netlify.com
   - New site from Git
   - Select `frontend` directory

2. **Build Settings**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Environment: `VITE_API_URL=https://api.ccpanalyzer.dz/api`

3. **Deploy**
   - Automatic on push
   - Custom domain setup

### Option 3: AWS S3 + CloudFront

1. **Build Frontend**
   ```bash
   npm run build
   ```

2. **Create S3 Bucket**
   - Enable static website hosting
   - Upload `build/` contents
   - Block all public access
   - Create CloudFront distribution

3. **CloudFront Configuration**
   - Origin: S3 bucket
   - Default cache behavior: dist/
   - HTTPS redirect
   - Invalidation: `/index.html`

4. **Domain Setup**
   - Point domain to CloudFront
   - Request SSL certificate in ACM
   - Attach to CloudFront

### Frontend Health Check

```bash
# Should return 200 and HTML content
curl https://ccpanalyzer.dz

# Should return 404 for unknown routes
curl https://ccpanalyzer.dz/nonexistent
```

## Environment Variables Reference

### Backend

```
# Database
DATABASE_URL=postgresql://user:pass@host:5432/ccp_analyzer

# Security
CLIENT_HASH_SALT=<32-char-random-string>
ACCESS_TOKEN_SECRET=<32-char-random-string>

# API Configuration
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://ccpanalyzer.dz

# Upload Limits
MAX_UPLOAD_FILES=100
MAX_UPLOAD_SIZE_MB=50
MAX_TOTAL_LINES=250000
```

### Frontend

```
VITE_API_URL=https://api.ccpanalyzer.dz/api
```

### Generate Random Strings

```bash
# Generate CLIENT_HASH_SALT
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Generate ACCESS_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## Post-Deployment Verification

### API Endpoints

```bash
# Test file preview (POST)
curl -X POST https://api.ccpanalyzer.dz/api/ccp/preview \
  -F "files=@test.txt"

# Test invalid token (GET)
curl https://api.ccpanalyzer.dz/api/ccp/result?token=invalid
# Should return 404

# Test invalid request (POST)
curl -X POST https://api.ccpanalyzer.dz/api/ccp/upload
# Should return 400 or 422
```

### Frontend Pages

```
https://ccpanalyzer.dz/               # Home page
https://ccpanalyzer.dz/upload         # Upload form
https://ccpanalyzer.dz/result?token=xxx  # Result page
```

### CORS Verification

```bash
curl -H "Origin: https://ccpanalyzer.dz" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  -X OPTIONS https://api.ccpanalyzer.dz/api/ccp/upload \
  -v

# Should see: Access-Control-Allow-Origin: https://ccpanalyzer.dz
```

## Monitoring & Logging

### Application Logs

**Render/Railway**: Built-in log viewer in dashboard

**VPS**: 
```bash
pm2 logs ccp-api
pm2 monit
```

### Database Monitoring

- Neon: Dashboard metrics
- Supabase: Built-in monitoring
- Self-hosted: pgAdmin or similar

### Error Tracking

Recommended: Sentry.io

```bash
npm install @sentry/node
# Add to main.ts
```

### Performance Monitoring

Monitor:
- API response times
- Database query times
- File upload size distribution
- Session count growth
- Error rates

## Backup & Recovery

### Database Backups

**Neon**: Automatic daily backups

**Supabase**: Automatic daily backups

**Self-hosted**:
```bash
# Daily backup script
pg_dump ccp_analyzer > backup-$(date +%Y%m%d).sql

# Weekly compressed backup
pg_dump ccp_analyzer | gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz
```

### Recovery Procedure

```bash
# Restore from backup
psql ccp_analyzer < backup-20260310.sql

# Or from compressed backup
gunzip -c backup-20260310.sql.gz | psql ccp_analyzer
```

### Disaster Recovery Plan

1. Backup location: Off-site cloud storage (S3, etc.)
2. RTO (Recovery Time Objective): 2 hours
3. RPO (Recovery Point Objective): 1 day
4. Test recovery: Monthly

## Scaling Considerations

### Current Capacity

- 1000 concurrent users: ✅ Supported
- 100+ files per upload: ✅ Supported
- 50,000+ lines per session: ✅ Supported

### When to Scale

Monitor these metrics:
- API response times > 5s → Scale backend
- Database connections maxed → Add read replicas
- Frontend build > 100MB → Split code
- Disk space < 20% free → Archive old sessions

### Scaling Options

- **Horizontal**: Multiple backend instances + load balancer
- **Vertical**: Larger database instance
- **Caching**: Redis for session data
- **CDN**: CloudFlare for static assets

## Security Hardening

### SSL/TLS

- [ ] HTTPS enforced (HTTP 301 redirect)
- [ ] HSTS header set (max-age=31536000)
- [ ] Certificate auto-renewal configured
- [ ] Certificate pinning (optional)

### API Security

- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (Prisma handles)
- [ ] XSS protection headers set

### Database Security

- [ ] Strong password for DB user
- [ ] Principle of least privilege
- [ ] Connection encryption enabled
- [ ] Backups encrypted
- [ ] Access logs enabled

### Application Security

- [ ] Environment variables not in code
- [ ] Secrets rotated periodically
- [ ] Dependency vulnerabilities scanned
- [ ] Security headers set
- [ ] No debug mode in production

## Rollback Procedure

### If Deployment Fails

1. **Render/Railway**:
   - Dashboard → Deployments
   - Select previous version
   - Click "Redeploy"

2. **VPS**:
   ```bash
   cd /opt/ccp-analyzer/backend
   git checkout previous-commit
   npm install
   npm run build
   pm2 restart ccp-api
   ```

3. **Database**:
   ```bash
   # Restore from backup if needed
   psql ccp_analyzer < backup-previous.sql
   ```

## DNS & Domain Configuration

### Domain Pointing

**Frontend**:
```
CNAME: ccpanalyzer.dz → [vercel/netlify/cloudfront]
```

**API Backend**:
```
A Record: api.ccpanalyzer.dz → [backend-ip]
or
CNAME: api.ccpanalyzer.dz → [render/railway domain]
```

### DNS Propagation

Typically 24 hours, check:
```bash
dig ccpanalyzer.dz
dig api.ccpanalyzer.dz
```

## Cost Optimization

### Estimated Monthly Costs

- **Database**: $15-50 (Neon/Supabase)
- **Backend**: $25-100 (Render/Railway/VPS)
- **Frontend**: $0-20 (Vercel/Netlify)
- **Domain**: $10-15
- **Monitoring**: $0-50 (Sentry optional)

**Total**: $50-235/month for MVP

### Cost Reduction Tips

- Use free tiers during MVP
- Archive old sessions after 90 days
- Use PostgreSQL (cheaper than other DBs)
- Single backend instance initially
- Compress old backups

## Maintenance Schedule

### Daily
- Monitor error logs
- Check API response times
- Verify backup completion

### Weekly
- Review database size growth
- Check security alerts
- Test critical endpoints

### Monthly
- Security audit
- Backup recovery test
- Performance review
- Dependency updates

### Quarterly
- Full security review
- Capacity planning
- Cost analysis
- Feature planning

## Support & Troubleshooting

### Common Issues

**502 Bad Gateway**:
- Backend not responding
- Check backend logs
- Verify database connection

**CORS Errors**:
- Frontend and API on different domains
- Check FRONTEND_URL environment variable
- Verify API CORS headers

**Slow Performance**:
- Database query optimization
- Add caching layer
- Scale backend instances

## Documentation

- [ ] Deployment runbook created
- [ ] Monitoring dashboards set up
- [ ] Runbook tested
- [ ] Team trained
- [ ] Incident response plan created
- [ ] Escalation procedures documented

## Sign-Off

- [ ] Product Manager approval
- [ ] Security review completed
- [ ] Performance testing passed
- [ ] Production deployment checklist complete
- [ ] Go-live date scheduled

---

**Ready to Deploy!** ✅

Run the deployment checklist and follow the appropriate deployment guide for your chosen platforms.
