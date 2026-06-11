# CSV Exports Documentation

## Overview

The CCP Analyzer generates six different CSV report files, each designed for specific use cases. All CSV files are generated on-demand when requested through the API.

## CSV Format Standards

### Encoding
- UTF-8 with BOM for Excel compatibility
- Line endings: LF (Unix style)

### Escaping
- Comma-separated values
- Fields containing commas, quotes, or newlines are quoted
- Double-quotes within quoted fields are escaped as `""`

### Amounts
- Format: Number with 2 decimal places
- Thousands separator: None (just digits)
- Decimal separator: `.` (period)
- Example: `1250000.00` not `1 250 000,00`

### Dates
- Format: `DD/MM/YYYY` (French style)
- Example: `05/03/2026`

### Headers
- Row 1: Always column names in French
- All lowercase with underscores
- Example: `nom_client`, `montant_echoue`, `taux_encaissement`

## Report Types

### 1. resume.csv (Summary Report)

**File**: `/api/ccp/download/summary.csv`

**Purpose**: High-level session overview with key metrics

**Columns**:
| Column | Description | Example |
|--------|-------------|---------|
| nom_showroom | Showroom name | "Showroom Alger Centre" |
| wilaya | Province/State | "Alger" |
| nombre_fichiers | Count of uploaded files | 35 |
| nombre_lignes | Total parsed lines | 5427 |
| lignes_invalides | Invalid/unparseable lines | 12 |
| montant_total_tente | Total amount attempted (all code) | 8500000.00 |
| montant_encaisse | Total amount collected (code=0) | 7200000.00 |
| montant_echoue | Total amount failed (code=1) | 1300000.00 |
| taux_encaissement | Collection rate percentage | 84.71 |
| nombre_clients | Unique client accounts | 234 |
| clients_avec_echec | Clients with any failures | 28 |
| clients_a_suivre | Follow-up classification | 45 |
| clients_a_risque | Risky classification | 12 |
| clients_a_bloquer | Block candidate classification | 3 |

**Row Count**: Exactly 2 rows (header + 1 data row)

**Example**:
```csv
nom_showroom,wilaya,nombre_fichiers,nombre_lignes,lignes_invalides,montant_total_tente,montant_encaisse,montant_echoue,taux_encaissement,nombre_clients,clients_avec_echec,clients_a_suivre,clients_a_risque,clients_a_bloquer
Showroom Alger,Alger,35,5427,12,8500000.00,7200000.00,1300000.00,84.71,234,28,45,12,3
```

---

### 2. clients_echoues.csv (Failed Clients Report)

**File**: `/api/ccp/download/failed_clients.csv`

**Purpose**: All clients with failed transactions, sorted by failure amount

**Columns**:
| Column | Description |
|--------|-------------|
| nom_client | Client name (original) |
| compte_ccp_masque | Masked CCP account (****5172) |
| montant_echoue | Total failed amount for this client |
| montant_encaisse | Total collected amount for this client |
| taux_encaissement | Success rate percentage |
| references_echouees_uniques | Count of distinct failed invoices |
| mois_echec | Count of months with failures |
| derniere_date_echec | Most recent failure date |
| score_risque | Risk score (0-100) |
| niveau_risque | Risk level (FAIBLE/MOYEN/ÉLEVÉ/CRITIQUE) |
| recommandation | Action recommendation |

**Row Count**: 1 header + N data rows (one per failed client)

**Sorting**: By failed amount descending (highest failures first)

**Example**:
```csv
nom_client,compte_ccp_masque,montant_echoue,montant_encaisse,taux_encaissement,references_echouees_uniques,mois_echec,derniere_date_echec,score_risque,niveau_risque,recommandation
M. SMITH AHMED,****5172,50000.00,35000.00,41.18,3,2,15/02/2026,65,ÉLEVÉ,"Contacter le client et vérifier la situation"
```

**Recommendations**: Contextual based on risk level
- Low risk: "À suivre"
- High risk: "Contacter le client et vérifier la situation"
- Critical: "Blocage recommandé"

---

### 3. clients_suivi.csv (Follow-up Report)

**File**: `/api/ccp/download/follow_up.csv`

**Purpose**: Clients requiring follow-up action (any failure)

**Columns**:
| Column | Description |
|--------|-------------|
| nom_client | Client name |
| compte_ccp_masque | Masked account |
| montant_echoue | Total failed amount |
| derniere_date_echec | Most recent failure date |
| raison | Failure reason |
| recommandation | Follow-up action |

**Row Count**: 1 header + N data rows

**Filtering**: Only `failedAmount > 0`

**Reason**: Always "Paiement échoué" (Payment failed)

**Recommendation**: Always "À contacter pour suivi" (Contact for follow-up)

---

### 4. clients_risque.csv (Risky Clients Report)

**File**: `/api/ccp/download/risky_clients.csv`

**Purpose**: High-risk clients requiring management attention

**Columns**:
| Column | Description |
|--------|-------------|
| nom_client | Client name |
| compte_ccp_masque | Masked account |
| montant_total_tente | Total amount attempted |
| montant_encaisse | Total collected |
| montant_echoue | Total failed |
| taux_encaissement | Collection rate % |
| references_echouees_uniques | Failed invoice count |
| mois_echec | Failed month count |
| score_risque | Risk score |
| niveau_risque | Risk level |

**Row Count**: 1 header + N data rows

**Filtering**: Only clients classified as RISKY (risk score 31+)

**Sorting**: By risk score descending (highest risk first)

---

### 5. liste_blocage.csv (Block List Report)

**File**: `/api/ccp/download/block_list.csv`

**Purpose**: Clients recommended for payment blocks

**Columns**:
| Column | Description |
|--------|-------------|
| nom_client | Client name |
| compte_ccp_masque | Masked account |
| montant_echoue | Total failed amount |
| montant_encaisse | Total collected |
| references_echouees_uniques | Failed invoice count |
| mois_echec | Failed month count |
| raison_blocage | Reason for block recommendation |
| recommandation | Action to take |

**Row Count**: 1 header + N data rows

**Filtering**: Only BLOCK CANDIDATES

**Block Reasons**:
- "Aucun paiement encaissé" (No collected payment)
- "Montant échoué critique" (Critical failed amount)

**Recommendation**: Always "Bloquer toute nouvelle facilité jusqu'au règlement" (Block all new facilities until payment)

---

### 6. toutes_lignes_nettoyees.csv (All Clean Lines Report)

**File**: `/api/ccp/download/all_clean.csv`

**Purpose**: Complete transaction ledger for audit and reconciliation

**Columns**:
| Column | Description |
|--------|-------------|
| nom_client | Client name |
| compte_ccp_masque | Masked account |
| montant | Transaction amount |
| date_operation | Operation date (DD/MM/YYYY) |
| code | 0 (success) or 1 (failure) |
| statut | "Encaissé" or "Échoué" |
| jours_retard | Days delayed |
| reference | Original transaction reference |
| reference_normalisee | Cleaned reference |
| nom_fichier | Source filename |

**Row Count**: 1 header + N data rows (one per transaction)

**Row Count**: Equals `totalLines - invalidLines`

**Sorting**: By operation date descending (most recent first)

**Columns**:
- `code`: Raw value (0 or 1)
- `statut`: Human-readable translation of code
- Both are included for clarity

---

## Data Relationships

### Client Deduplication

Across all reports, clients are identified by `clientAccountHash`.

When displaying:
- Show masked account: `****5172`
- Show original name: `M.MENAOUER ALI`
- Aggregate statistics across all matching account hashes

### Amount Aggregation

All amounts are summed:
```
Montant encaissé = SUM(amount WHERE code = 0)
Montant échoué = SUM(amount WHERE code = 1)
Montant total tenté = SUM(amount WHERE code = 0 OR code = 1)
```

### Date Fields

- **operationDate**: Parsed from CCP file
- **derniere_date_echec**: MAX(operationDate WHERE code = 1)
- **date_operation**: Formatted as DD/MM/YYYY

---

## Generation Pipeline

### For Each Report

1. Query database for matching transactions
2. Group by client (using `clientAccountHash`)
3. Calculate client-level statistics
4. Filter by classification criteria
5. Sort by specified column
6. Format as CSV with proper escaping
7. Return as text/csv with appropriate filename

### Performance

- Summary: Generated in <100ms
- Others: Generated in proportional time to data volume
- Example: 5000 transactions → ~500ms for largest report

---

## CSV Output Examples

### Summary Example

```csv
nom_showroom,wilaya,nombre_fichiers,nombre_lignes,lignes_invalides,montant_total_tente,montant_encaisse,montant_echoue,taux_encaissement,nombre_clients,clients_avec_echec,clients_a_suivre,clients_a_risque,clients_a_bloquer
Showroom Alger,Alger,35,5427,12,8500000.00,7200000.00,1300000.00,84.71,234,28,45,12,3
```

### Failed Clients Example

```csv
nom_client,compte_ccp_masque,montant_echoue,montant_encaisse,taux_encaissement,references_echouees_uniques,mois_echec,derniere_date_echec,score_risque,niveau_risque,recommandation
M. SMITH AHMED,****5172,50000.00,35000.00,41.18,3,2,15/02/2026,65,ÉLEVÉ,"Contacter le client et vérifier la situation"
M. JONES SARA,****1234,25000.00,50000.00,66.67,1,1,20/02/2026,20,FAIBLE,"À suivre"
```

### All Clean Lines Example

```csv
nom_client,compte_ccp_masque,montant,date_operation,code,statut,jours_retard,reference,reference_normalisee,nom_fichier
M. MENAOUER ALI,****5172,786.67,05/03/2026,0,Encaissé,0,FMECHE251101705,FMECHE251101705,RESULT-21008367-CHADA.txt
M. NAROUNE YOUCEF,****6185,614.58,05/01/2025,1,Échoué,0,AHMED241200104,AHMED241200104,RESULT-21008367-WISAM.txt
```

---

## Opening in Excel

### French Localization

CSVs are generated with:
- UTF-8 encoding
- French column names
- Semicolon-separated (for fr-FR locale) or comma-separated

**To import into Excel**:
1. Open Excel
2. File → Open
3. Select CSV file
4. Text Import Wizard → Set Delimiter to Comma
5. Column Format → Ensure dates are recognized as dates

### Formatting

- Amount columns should be formatted as numbers
- Date columns should be formatted as dates
- Currency symbol: DA (Algerian Dinar)

---

## Integration with Analysis Flow

1. **Session Created**: Analysis session stored in DB
2. **Files Parsed**: All transactions inserted
3. **CSV Generated On-Demand**: When user clicks download
4. **Token Verified**: Only owner can download
5. **File Streamed**: Browser downloads with filename

---

## Error Handling

- **Invalid token**: HTTP 404 (Session not found)
- **Database error**: HTTP 500
- **Empty result**: Returns valid CSV with only header row

---

## Implementation Details

See `backend/src/ccp/csv-export.service.ts` for implementation.

Methods:
- `generateSummaryCsv(sessionId)`
- `generateFailedClientsCsv(sessionId)`
- `generateFollowUpCsv(sessionId)`
- `generateRiskyClientsCsv(sessionId)`
- `generateBlockListCsv(sessionId)`
- `generateAllCleanLinesCsv(sessionId)`
- `escapeCsvValue(value)` - Handles CSV escaping

---

## Customization

To add new columns:

1. Add to query in corresponding method
2. Add column header to rows array
3. Format value appropriately
4. Update documentation

Example:
```typescript
rows.push(`${new_column1},${new_column2},...`);
```

---

## Archival & Record Keeping

**Recommendation**: Store downloaded CSVs for:
- Legal compliance (accounting records)
- Historical comparison (month-over-month trends)
- Audit trail (who downloaded when)

**File naming convention**:
```
ccp_analyzer_[report_type]_[showroom]_[date]_[time].csv
```

Example: `ccp_analyzer_risque_Alger_20260305_143022.csv`
