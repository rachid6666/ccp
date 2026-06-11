# Privacy, Consent & Data Processing Documentation

## Overview

CCP Analyzer DZ implements privacy-first data handling for CCP (Algérie Poste) payment information. This document outlines consent requirements, data protection measures, and compliance approach.

## Consent Framework

### Pre-Upload Consent Message

Before uploading files, users must accept this consent text:

#### French Original
```
En important ces fichiers, je confirme que je suis autorisé à traiter ces 
données dans le cadre de mon activité commerciale.

J'accepte que CCP Analyzer DZ analyse et stocke les données CCP importées 
afin de générer des rapports, des statistiques et des indicateurs de risque.

Les comptes CCP seront masqués dans l'interface et utilisés de manière 
sécurisée pour l'analyse.
```

#### Checkbox Label
```
J'ai lu et j'accepte les conditions d'analyse et de traitement des données.
```

#### Disclaimer Note
```
CCP Analyzer DZ ne partage pas vos fichiers avec d'autres showrooms. 
Les données sont utilisées pour générer votre rapport et améliorer les 
indicateurs de risque.
```

### Consent Validation

- Checkbox must be explicitly checked
- Upload blocked if unchecked
- Timestamp recorded: `consentAcceptedAt`
- Boolean flag stored: `consentAccepted`

### Legal Authority Confirmation

Users confirm:
1. **Authority**: "Autorisé à traiter ces données" - Authorized to process this data
2. **Purpose**: Within commercial activity scope
3. **Processing**: Accept analysis and storage
4. **Use**: Reports and risk indicators
5. **Security**: Accounts masked and secure

## Data Protection Measures

### CCP Account Security

#### Hashing Strategy
```typescript
clientAccountHash = SHA256(clientAccount + CLIENT_HASH_SALT)
```

**Properties**:
- One-way function (cannot reverse)
- Salt added to prevent rainbow table attacks
- 256-bit output (64 hex characters)
- Used for internal deduplication

**Example**:
- Input: `0000565172` with salt `my-secret-salt`
- Output: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

#### Masking Strategy
```typescript
accountMask = `****${account.slice(-4)}`
```

**Properties**:
- Only last 4 digits visible
- First 6 digits hidden
- Used for UI display only
- Easy for user to identify account

**Example**: `0000565172` → `****5172`

#### Storage Strategy
- Database stores `clientAccountHash` only (no raw account)
- Display uses `clientAccountMask` only (no raw account)
- Raw account never stored
- Raw account only in memory during parsing

### Session Token Security

#### Token Generation
```typescript
accessToken = randomBytes(32).toString('hex')
```

**Properties**:
- 64-character hex string
- Cryptographically random
- 256-bit entropy

#### Token Storage
```typescript
accessTokenHash = SHA256(accessToken + ACCESS_TOKEN_SECRET)
```

**Properties**:
- Only hash stored in database
- Raw token only in response
- Client stores token in URL
- Cannot reverse-engineer from stored hash

#### Token Scope
- Grants access to one session only
- No cross-session access
- No expiration by default (can be added)
- Revoke by deleting session

#### Example Flow
```
User uploads files
→ Backend generates: accessToken = "abc123...xyz789" (64 hex chars)
→ Backend hashes:   accessTokenHash = SHA256(accessToken + secret)
→ Database stores:  accessTokenHash
→ Backend returns:  accessToken (raw, in response JSON)
→ Frontend stores:  accessToken in URL: /result?token=abc123...xyz789
→ User downloads:   Token sent in query string, backend verifies hash matches
```

### Data Minimization

**Collected Data**:
- Showroom name (required)
- Phone (optional)
- Wilaya/Province (optional)
- CCP transactions only

**Not Collected**:
- Personal names beyond CCP data
- Email addresses
- Social security numbers
- Credit card information
- Login credentials

### Purpose Limitation

Data used only for:
1. **Report Generation**: Session-specific analysis
2. **Risk Indicators**: National dataset aggregation
3. **Analytics**: Improvement of risk algorithms
4. **Compliance**: Regulatory requirements

**Not Used For**:
- Selling to third parties
- Marketing
- Advertising
- Sharing between showrooms
- Unauthorized purposes

### Data Retention

**Session Data**:
- Kept indefinitely (recommend 1-2 year archival policy)
- Accessible via token
- Can be deleted on request

**Global Risk Dataset**:
- Aggregated, anonymized data
- Client accounts hashed
- No link to specific showrooms
- Kept for historical analysis

## Database Security

### Encryption
- Database connection: TLS/SSL required
- At-rest: Database provider handles (Supabase/Neon)
- Transit: HTTPS only (enforced in production)

### Access Control
- Database user: Limited privileges
- Read-only view for reports (optional)
- No direct web access to database
- API gateway only

### Backup & Recovery
- Regular automated backups
- Encrypted backup storage
- Recovery tested monthly
- Disaster recovery plan in place

## Compliance Considerations

### GDPR-Like Principles (if applicable)

1. **Lawfulness**: User consent obtained
2. **Purpose**: Stated and limited
3. **Minimization**: Only needed data collected
4. **Accuracy**: Data from authoritative source (CCP)
5. **Storage Limitation**: Retention policy documented
6. **Integrity & Confidentiality**: Security measures in place
7. **Accountability**: This documentation proves compliance

### Data Subject Rights (if applicable)

- **Access**: User can download their session reports
- **Rectification**: Contact support to correct data
- **Erasure**: Session deletion on request
- **Restriction**: Block further processing on request
- **Portability**: Export data in CSV format
- **Objection**: Opt-out of global dataset

**Implementation**: Add admin endpoints for these rights

### Export Control
- No sensitive data exported outside Algeria
- Supabase/Neon: Choose Algeria-region if available
- Alternative: Self-hosted PostgreSQL in Algeria

## Consent Record Management

### What We Record
```typescript
UploadLead {
  consentAccepted: true,        // Boolean
  consentAcceptedAt: 2026-03-15, // DateTime
  createdAt: 2026-03-15,
  showroomName: "...",
  phone: "...",
  wilaya: "..."
}
```

### Audit Trail
- Timestamp: When consent accepted
- Flag: Whether accepted or rejected
- No consent = no upload possible
- Records preserved for compliance

## Third-Party Data Handling

### Database Providers

**Supabase**:
- PostgreSQL managed service
- Automatic backups
- Encryption at rest
- SOC 2 compliant

**Neon**:
- PostgreSQL serverless
- Point-in-time recovery
- Automatic backups
- Enterprise security

**Requirements**:
- Europe or Middle East region
- Compliance with local laws
- Data processing agreement

### Frontend Hosting

**Vercel**:
- CDN edge locations
- HTTPS enforced
- DDoS protection
- No data storage

**Netlify**:
- Similar security posture
- HTTPS required
- Edge functions (optional)

### Backend Hosting

**Render**:
- Managed container platform
- HTTPS enforced
- Environment variables secure
- Database isolated

**Railway**:
- Similar features
- Private networking option
- Automatic backups

### Data Processing Agreements

Ensure all providers have:
- DPA (Data Processing Agreement)
- GDPR compliance commitment
- Sub-processor disclosure
- Data protection standards

## User Privacy Best Practices

### Do
✅ Be transparent about data usage
✅ Store only necessary data
✅ Hash sensitive identifiers
✅ Use HTTPS/TLS everywhere
✅ Log data access for audit
✅ Provide data export option
✅ Have clear retention policy
✅ Educate users on security

### Don't
❌ Share data with other showrooms
❌ Sell user data
❌ Store unencrypted passwords
❌ Log full CCP accounts
❌ Keep data longer than needed
❌ Use for unauthorized purposes
❌ Expose raw personal data in reports
❌ Skip security updates

## Incident Response

### Data Breach Protocol

1. **Detection**: Monitor for unauthorized access
2. **Containment**: Isolate affected systems
3. **Investigation**: Determine scope and impact
4. **Notification**: Inform users if required
5. **Remediation**: Fix vulnerabilities
6. **Documentation**: Record incident details

### Security Monitoring

- Failed login attempts logged
- API rate limiting enabled
- Suspicious activity alerts
- Regular security audits

## Regulatory Compliance

### Algeria-Specific Considerations

- CCP data: Subject to financial privacy law
- Payment security: PCI DSS principles
- Commercial data: Subject to commercial law
- Consent: Explicit opt-in required

### International Standards

- ISO 27001: Information security management
- SOC 2: Security controls
- NIST Cybersecurity Framework
- OWASP Top 10: Web application security

## Privacy Policy Template

See separate privacy policy document for user-facing terms.

**Should cover**:
1. What data we collect
2. Why we collect it
3. How we protect it
4. How long we keep it
5. User rights
6. Contact for privacy questions

## Consent Form Features

### Frontend Implementation

```typescript
// Upload page requires:
- Checkbox for acceptance
- Clear readable text
- Link to full terms
- Cannot submit without checking
- Timestamp recorded on backend
```

### Documentation

```typescript
UploadLead {
  consentAccepted: boolean,
  consentAcceptedAt: DateTime,
  // Additional fields
}
```

## Recommendations

### Short-term (MVP)
1. ✅ Implement consent checkbox
2. ✅ Hash all CCP accounts
3. ✅ Mask accounts in UI
4. ✅ Use HTTPS in production
5. ✅ Store tokens as hashes

### Medium-term (Month 2-3)
1. Implement automated data retention policy
2. Add admin data deletion endpoints
3. Create privacy policy document
4. Security audit by third party
5. User data export feature

### Long-term (Month 6+)
1. GDPR/local law compliance audit
2. Data processing agreements with providers
3. Incident response procedures
4. Regular security testing (penetration test)
5. Privacy impact assessment

## Testing Privacy Controls

```typescript
// Test cases
- Consent checkbox required to proceed
- Raw CCP account never in response
- Masked account always shown
- Token hash stored, never raw token
- Multiple accounts not mixed between sessions
- Session data access requires valid token
- HTTPS enforced in production
```

## Contact Information

**For Privacy Questions**:
- Email: privacy@ccpanalyzer.dz
- Website: https://ccpanalyzer.dz/privacy
- Support: https://ccpanalyzer.dz/support

## Document History

| Date | Version | Change |
|------|---------|--------|
| 2026-03-10 | 1.0 | Initial documentation |

---

**Last Updated**: March 10, 2026
**Next Review**: September 10, 2026
