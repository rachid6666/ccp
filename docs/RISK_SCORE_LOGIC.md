# Risk Scoring Logic Documentation

## Overview

Risk scoring is the process of evaluating each client's payment history to classify them into categories and assign a numeric risk score from 0-100.

## Classification System

### Four Client Categories

#### 1. Follow-Up Clients
**Definition**: Any client with at least one failed transaction

**Condition**:
```
failedAmount > 0 DA
```

**Action**: Contact client to understand payment issues

**Count**: `followUpClientCount`

#### 2. Risky Clients
**Definition**: Clients showing significant payment problems

**Any of these conditions**:
- `failedAmount >= 20,000 DA`
- `uniqueFailedReferences >= 3` (failed 3+ different invoices)
- `failedMonthsCount >= 2` (failures in 2+ different months)
- `failureRateByAmount >= 60% AND failedAmount >= 10,000 DA`

**Action**: Requires management attention and careful monitoring

**Count**: `riskyClientCount`

#### 3. Block Candidates
**Definition**: High-risk clients recommended for payment blocks

**Any of these conditions**:
- `failedAmount >= 50,000 DA`
- `uniqueFailedReferences >= 5` (failed 5+ different invoices)
- `failedMonthsCount >= 3` (failures in 3+ different months)
- `collectedAmount = 0 AND failedAmount >= 20,000 DA` (all-failed customer)

**Action**: Block all new payment facilities until current debts resolved

**Count**: `blockCandidateCount`

## Risk Score Calculation

### Formula

```
score =
  (failedAmount / 1000) +
  (uniqueFailedReferences * 8) +
  (failedMonthsCount * 12) +
  recentFailurePenalty +
  noSuccessPenalty -
  (collectedAmount / 5000)
```

### Components Explained

#### 1. Failed Amount Component
```
failedAmount / 1000
```

- **Range**: 0 to 100+ (before clamping)
- **Purpose**: Direct correlation to financial risk
- **Example**: 50,000 DA failed = +50 points

#### 2. Unique Failed References Component
```
uniqueFailedReferences * 8
```

- **Range**: 0 to 80+ (before clamping)
- **Purpose**: Shows pattern across multiple invoices
- **Weight**: 8 points per distinct invoice
- **Example**: 5 failed invoices = +40 points
- **Prevents**: False positives from single echéance split into multiple lines

#### 3. Failed Months Component
```
failedMonthsCount * 12
```

- **Range**: 0 to 36+ (before clamping)
- **Purpose**: Shows persistence of problems across time
- **Weight**: 12 points per failed month
- **Example**: Failures in Jan, Feb, Mar = +36 points
- **Important**: One problem month < multiple months of problems

#### 4. Recent Failure Penalty
```
if (daysSinceLastFailure <= 30) +15
else if (daysSinceLastFailure <= 60) +10
else if (daysSinceLastFailure <= 90) +5
else 0
```

- **Purpose**: Recent problems are more concerning than old ones
- **Max Penalty**: +15 points
- **Example**: Failure last week = +15, failure 6 months ago = 0

#### 5. No Success Penalty
```
if (collectedAmount = 0 AND failedAmount >= 10,000) +20
else 0
```

- **Purpose**: Customers with zero collected amount are highest risk
- **Applies when**:
  - No successful payments in this analysis period
  - At least 10,000 DA attempted (not just noise)
- **Max Penalty**: +20 points
- **Example**: 0 collected, 30,000 DA failed = +20

#### 6. Success Mitigation Factor
```
-(collectedAmount / 5000)
```

- **Range**: 0 to -100+ (before clamping)
- **Purpose**: Rewards clients with successful payment history
- **Effect**: Reduces final score proportionally to success
- **Example**: 50,000 DA collected = -10 points

### Final Score Clamping

```typescript
score = Math.max(0, Math.min(100, score))
```

- **Minimum**: 0 (no risk)
- **Maximum**: 100 (critical risk)
- **Purpose**: Standardized scale for reporting

## Risk Levels

| Score Range | Level | French | Action |
|-------------|-------|--------|--------|
| 0-30 | Low | FAIBLE | Normal monitoring |
| 31-60 | Medium | MOYEN | Regular follow-up |
| 61-80 | High | ÉLEVÉ | Close monitoring required |
| 81-100 | Critical | CRITIQUE | Immediate intervention |

## Calculation Examples

### Example 1: Low-Risk Client

**Client Data**:
- totalAttemptedAmount: 100,000 DA
- totalCollectedAmount: 95,000 DA
- totalFailedAmount: 5,000 DA
- uniqueFailedReferences: 1
- failedMonthsCount: 1
- lastFailureDate: 120 days ago

**Calculation**:
```
score = (5000/1000) + (1*8) + (1*12) + 0 + 0 - (95000/5000)
score = 5 + 8 + 12 + 0 + 0 - 19
score = 6
```

**Result**: FAIBLE (Low Risk) ✓

### Example 2: Medium-Risk Client

**Client Data**:
- totalAttemptedAmount: 80,000 DA
- totalCollectedAmount: 50,000 DA
- totalFailedAmount: 30,000 DA
- uniqueFailedReferences: 3
- failedMonthsCount: 2
- lastFailureDate: 15 days ago

**Calculation**:
```
score = (30000/1000) + (3*8) + (2*12) + 15 + 0 - (50000/5000)
score = 30 + 24 + 24 + 15 + 0 - 10
score = 83 → Clamped to 100, but reflects CRITIQUE
```

**Result**: CRITIQUE (Critical Risk) ⚠️

### Example 3: Block-Worthy Client

**Client Data**:
- totalAttemptedAmount: 70,000 DA
- totalCollectedAmount: 0 DA (CRITICAL)
- totalFailedAmount: 70,000 DA
- uniqueFailedReferences: 6
- failedMonthsCount: 3
- lastFailureDate: 10 days ago

**Calculation**:
```
score = (70000/1000) + (6*8) + (3*12) + 15 + 20 - (0/5000)
score = 70 + 48 + 36 + 15 + 20 - 0
score = 189 → Clamped to 100
```

**Result**: CRITIQUE, Block Candidate ⛔

## Important Considerations

### Why Line Count Doesn't Matter

❌ **WRONG**: "Client has 5 failed lines → risky"

**Reason**: One échéance can be split into 5+ lines for partial payments
- Last line might be only 500 DA
- Raw count creates false positives

✅ **RIGHT**: "Client has 25,000 DA failed across 3 distinct invoices over 2 months → risky"

### Why Amount Matters

- **Amount-based risk**: More reliable indicator
- **Pattern-based risk**: Multiple invoices, multiple months
- **Time-based risk**: Recent failures worse than old ones

### Collection Rate Nuance

```
collectionRate = (collectedAmount / attemptedAmount) * 100
```

- **60% collection rate**: Moderate concern
- **80% collection rate**: Likely acceptable
- **0% collection rate**: High concern (especially if failedAmount > 20k)

## Implementation

See `backend/src/ccp/risk-scoring.service.ts` for code implementation.

### Key Methods

- `calculateRiskScore(client): { score, level }`
- `classifyFollowUp(client): boolean`
- `classifyRisky(client): boolean`
- `classifyBlockCandidate(client): boolean`

## Testing Risk Scoring

```typescript
// Test case: Raw line count should NOT cause block
const client = {
  failedAmount: 3000,
  failedLineCount: 10,  // Many lines but low amount
  uniqueFailedReferences: 2,
  failedMonthsCount: 1,
};

expect(service.classifyRisky(client)).toBe(false);
expect(service.classifyBlockCandidate(client)).toBe(false);
```

## Configuration & Customization

If requirements change, modify these values in `risk-scoring.service.ts`:

```typescript
// Thresholds
RISKY_AMOUNT_THRESHOLD = 20000;
BLOCK_AMOUNT_THRESHOLD = 50000;

// Scoring weights
AMOUNT_WEIGHT = 1000;
REFERENCE_WEIGHT = 8;
MONTH_WEIGHT = 12;
RECENT_PENALTY = 15;
NO_SUCCESS_PENALTY = 20;
SUCCESS_MITIGATION = 5000;

// Reference/Month limits
RISKY_REFERENCES_THRESHOLD = 3;
RISKY_MONTHS_THRESHOLD = 2;
BLOCK_REFERENCES_THRESHOLD = 5;
BLOCK_MONTHS_THRESHOLD = 3;
```

## Reports Using Risk Scores

### Risky Clients CSV
- Only includes clients classified as RISKY
- Sorted by risk score descending
- Used for management attention

### Block List CSV
- Only includes BLOCK CANDIDATES
- Recommended for immediate action
- Usually 5-20% of clients with failures

## Integration with Analysis Flow

1. **Parse Files**: Extract all CCP lines
2. **Aggregate Client Data**: Summarize per-client statistics
3. **Calculate Risk Scores**: Run scoring algorithm
4. **Classify Clients**: Assign to categories
5. **Generate Reports**: Create CSV files by classification
6. **Update Session**: Store counts and results

## FAQ

**Q: Why is a client with one 50,000 DA failure different from one with 10x 5,000 DA failures?**

A: Both are risky, but differently. First shows magnitude risk, second shows pattern risk. Score accounts for both.

**Q: What if a client collects 99% but has one 50,000 DA failure?**

A: Still risky (failed amount >= 20k threshold). High success rate mitigates but doesn't eliminate risk.

**Q: How should we use the risk scores operationally?**

A: FAIBLE ≤ 30 → Annual review
MOYEN 31-60 → Quarterly review  
ÉLEVÉ 61-80 → Monthly review
CRITIQUE 81-100 → Weekly review or action

## Performance

Risk scoring is calculated:
- **Once per session** (after all files parsed)
- **Once per client** (aggregate stats)
- **Bulk operation** (under 1 second for 1000+ clients)

No real-time recalculation unless session is re-analyzed.
