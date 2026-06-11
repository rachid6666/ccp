# CCP Analyzer DZ - Documentation

## Overview

CCP Analyzer DZ is a fast public web application designed for Algerian CCP (Algérie Poste) showrooms to analyze payment result files in seconds and generate comprehensive risk reports.

The app is completely separate from VYVEX ERP with its own PostgreSQL database, backend, and frontend.

## Features

- **Fast Analysis**: Process 30+ CCP RESULT TXT files in under 30 seconds
- **No Login Required**: Simple session-based access using tokens
- **Secure Data Handling**: CCP accounts are hashed and masked
- **CSV Reports**: Generate 6 different report types
- **Risk Scoring**: Intelligent client risk classification based on payment patterns
- **French UI**: Fully localized user interface for Algerian users

## Architecture

```
ccp_analyzer/
├── backend/                 # NestJS API
│   ├── src/
│   │   ├── ccp/            # CCP business logic
│   │   ├── common/         # Utilities and services
│   │   ├── prisma/         # Database service
│   │   └── main.ts
│   ├── prisma/             # Database schema and migrations
│   └── test/               # Test files
├── frontend/               # React application
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── api/            # API client
│   │   └── App.tsx
│   └── index.html
└── docs/                   # Documentation
```

## Stack

- **Backend**: NestJS (TypeScript)
- **ORM**: Prisma with PostgreSQL
- **Frontend**: React 18 (TypeScript)
- **Database**: PostgreSQL
- **UI Language**: French only
- **Authentication**: Session tokens (no passwords)

## Project Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your database credentials:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/ccp_analyzer"
   CLIENT_HASH_SALT="your-32-character-salt-key-here!"
   ACCESS_TOKEN_SECRET="your-32-character-token-secret!"
   ```

4. Run database migrations:
   ```bash
   npx prisma migrate dev --name init
   npm run prisma:generate
   ```

5. Start the development server:
   ```bash
   npm run start:dev
   ```

The backend will be available at `http://localhost:3001`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Update `.env`:
   ```
   VITE_API_URL=http://localhost:3001/api
   ```

4. Start the development server:
   ```bash
   npm start
   ```

The frontend will be available at `http://localhost:3000`

## Database Setup

### PostgreSQL Configuration

1. Create the database:
   ```sql
   CREATE DATABASE ccp_analyzer;
   ```

2. The Prisma migrations will create all required tables automatically.

3. View the database schema in `backend/prisma/schema.prisma`

### Database Models

- **UploadLead**: Stores showroom information and consent
- **AnalysisSession**: Contains analysis metadata and KPI summary
- **UploadedFile**: Metadata for each uploaded file
- **CcpLine**: Individual CCP transaction lines
- **GlobalRiskClient**: National risk dataset for clients

See `docs/GLOBAL_RISK_DATASET.md` for aggregation rules and privacy boundaries.

## API Endpoints

### Public Endpoints

#### POST `/api/ccp/preview`
Preview files before upload (no database write)

**Request**: Multipart form with files

**Response**:
```json
{
  "fileCount": 35,
  "totalLines": 5427,
  "invalidLines": 12,
  "attemptedAmount": 8500000,
  "collectedAmount": 7200000,
  "failedAmount": 1300000
}
```

#### POST `/api/ccp/upload`
Upload and analyze files

**Request**: Multipart form data
- `files[]`: Array of .txt files
- `showroomName`: String (required)
- `phone`: String (optional)
- `wilaya`: String (optional)
- `consentAccepted`: Boolean (required)

**Response**:
```json
{
  "accessToken": "64-character-hex-string",
  "sessionId": 123
}
```

#### GET `/api/ccp/result?token=`
Get session KPI summary

**Response**:
```json
{
  "id": 123,
  "showroomName": "Showroom Alger",
  "wilaya": "Alger",
  "fileCount": 35,
  "totalLines": 5427,
  "attemptedAmount": 8500000,
  "collectedAmount": 7200000,
  "failedAmount": 1300000,
  "collectionRate": 84.71,
  "failedClientCount": 28,
  "followUpClientCount": 45,
  "riskyClientCount": 12,
  "blockCandidateCount": 3
}
```

#### CSV Download Endpoints

All CSV endpoints require `?token=` parameter

- `GET /api/ccp/download/summary.csv` - Overall summary
- `GET /api/ccp/download/failed_clients.csv` - Failed transactions by client
- `GET /api/ccp/download/follow_up.csv` - Clients needing follow-up
- `GET /api/ccp/download/risky_clients.csv` - High-risk clients
- `GET /api/ccp/download/block_list.csv` - Recommended block list
- `GET /api/ccp/download/all_clean.csv` - All cleaned transaction lines

## CCP RESULT Parser

### File Format

CCP RESULT files must follow this fixed-width format:

```
CLIENT_ACCOUNT NAME              AMOUNT   DATE       CCP_ACCOUNT CODE DELAY REFERENCE...
0000565172     M.MENAOUER ALI    786.67   05/03/2026 0021008367 0    00    FMECHE251101705
```

### Parser Regex

```typescript
/^(\d{10})\s*([A-ZÀ-ÿ.\-'\s]+?)\s*(\d+\.\d{2})\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{10})\s*([01])\s*(\d{2})\s*(.+)$/i
```

### Parsed Fields

| Field | Type | Description |
|-------|------|-------------|
| clientAccount | string | 10-digit CCP account number |
| clientName | string | Client name with prefixes |
| amount | decimal | Transaction amount in DA |
| operationDate | date | DD/MM/YYYY format |
| ccpAccount | string | 10-digit CCP center account |
| code | 0 or 1 | 0 = collected, 1 = failed |
| delayDays | integer | Days since operation |
| reference | string | Transaction reference |

## Risk Scoring Logic

### Risk Classification

**Follow-up**: `failedAmount > 0`

**Risky**: Any of:
- `failedAmount >= 20,000 DA`
- `uniqueFailedReferences >= 3`
- `failedMonthsCount >= 2`
- `failureRate >= 60% AND failedAmount >= 10,000 DA`

**Block Candidate**: Any of:
- `failedAmount >= 50,000 DA`
- `uniqueFailedReferences >= 5`
- `failedMonthsCount >= 3`
- `collectedAmount = 0 AND failedAmount >= 20,000 DA`

### Risk Score Calculation

```
score =
  failedAmount / 1000 +
  uniqueFailedReferences * 8 +
  failedMonthsCount * 12 +
  recentFailurePenalty +
  noSuccessPenalty -
  collectedAmount / 5000
```

**Recent Failure Penalty**:
- Last failure ≤ 30 days: +15
- Last failure ≤ 60 days: +10
- Last failure ≤ 90 days: +5

**No Success Penalty**:
- If `collectedAmount = 0 AND failedAmount >= 10,000`: +20

**Final Score**: Clamped to 0-100

**Risk Levels**:
- 0-30: FAIBLE (Low)
- 31-60: MOYEN (Medium)
- 61-80: ÉLEVÉ (High)
- 81-100: CRITIQUE (Critical)

## CSV Output Formats

### summary.csv
Session overview with KPIs

### failed_clients.csv
All clients with any failed transactions

### follow_up.csv
Clients requiring follow-up action

### risky_clients.csv
High-risk clients based on risk score

### block_list.csv
Recommended clients for payment block

### all_clean.csv
Complete list of all parsed transactions

## Security

### Data Protection

- **CCP Account Hashing**: SHA-256 with `CLIENT_HASH_SALT`
- **CCP Account Masking**: Display format `****5172` (last 4 digits only)
- **Token Hashing**: `accessTokenHash` stored in database, never raw token
- **CORS**: Restricted to frontend domain only
- **HTTPS**: Required in production

### Limits

- Maximum 100 files per upload
- Maximum 50 MB total upload size
- Token expiration: No automatic expiration (configure as needed)
- Session retention: Kept indefinitely (implement cleanup policy)

### Consent Management

Users must accept data processing consent before upload:
- Confirms authorization to process CCP data
- Accepts structured data storage for risk analysis
- Acknowledges CCP account masking

## Running Tests

### Backend Tests

```bash
cd backend
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:cov        # Coverage report
```

### Test Coverage

- CCP Parser: Valid/invalid line parsing
- Risk Scoring: Client classification and score calculation
- CSV Export: All report formats
- File Upload: Multi-file validation

## Deployment

### Environment Variables

Required for production:

```
DATABASE_URL=postgresql://user:pass@prod-db:5432/ccp_analyzer
CLIENT_HASH_SALT=32-character-random-string-generated-with-crypto
ACCESS_TOKEN_SECRET=32-character-random-string-generated-with-crypto
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com
MAX_UPLOAD_FILES=100
MAX_UPLOAD_SIZE_MB=50
MAX_TOTAL_LINES=250000
```

### Backend Deployment

Suitable for: Render, Railway, VPS

```bash
npm run build
npm start
```

### Frontend Deployment

Suitable for: Vercel, Netlify, AWS S3 + CloudFront

```bash
npm run build
# Deploy contents of dist/ directory
```

### Database Deployment

- Neon.tech (PostgreSQL as a service)
- Supabase (PostgreSQL + Auth)
- Self-hosted PostgreSQL on VPS

## Monitoring & Maintenance

### Database Maintenance

```bash
# Backup database
pg_dump ccp_analyzer > backup.sql

# Restore database
psql ccp_analyzer < backup.sql
```

### Logs

- Backend: Check NestJS console output
- Frontend: Browser console
- Database: PostgreSQL logs

### Performance

- Index on `sessionId` for quick lookups
- Index on `clientAccountHash` for risk calculations
- Index on `operationDate` for monthly reports
- Bulk insert for CCP lines (improved from individual inserts)

## Common Issues & Solutions

### Issue: "Token is required"
Solution: Ensure token is passed in query string: `?token=xxx`

### Issue: "Session not found"
Solution: Token may have expired or been incorrectly copied

### Issue: Files not parsing
Solution: Validate file format matches CCP RESULT format specification

### Issue: CORS error
Solution: Check `FRONTEND_URL` environment variable matches frontend domain

## Future Enhancements

- [ ] National risk dataset dashboard (admin panel)
- [ ] Multi-showroom account management
- [ ] Advanced filtering and search
- [ ] Charts and visualizations
- [ ] Scheduled file analysis
- [ ] Email report delivery
- [ ] Mobile app version
- [ ] WebSocket real-time updates

## Support

For issues or questions, contact the development team or check the documentation files in `/docs`.

## License

Copyright 2024 - CCP Analyzer DZ. All rights reserved.
