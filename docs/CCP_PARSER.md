# CCP RESULT Parser Documentation

## Overview

The CCP Parser is the core service that parses Algérie Poste CCP RESULT text files into structured data for analysis.

## File Format Specification

CCP RESULT files are fixed-width text files with one transaction per line.

### Format Structure

```
POSITION  LENGTH  FIELD              FORMAT
1-10      10      Client Account     10 digits (0-padded)
11-40     30      Client Name        Text, right-padded
41-49     9       Amount             Decimal: XXXXX.DD
50-59     10      Operation Date     DD/MM/YYYY
60-69     10      CCP Account        10 digits
70-71     2       Code               0 or 1
72-73     2       Delay Days         00-99 days
74-        varies  Reference          Text string
```

### Example Lines

```
0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705
0001766185M.NAROUNE YOUCEF           00000000614.5805/01/20250021008367000AHMED241200104
0002016874M.RADJA CHIKH              00000001640.0005/02/20250021008367000FMECHE250100301
```

## Parser Rules

### Field Validation

| Field | Rules | Example |
|-------|-------|---------|
| Client Account | Must be 10 digits | `0000565172` |
| Name | Text with optional accents | `M.MENAOUER ALI` |
| Amount | Two decimals, numeric | `786.67` |
| Date | DD/MM/YYYY format | `05/03/2026` |
| CCP Account | 10 digits | `0021008367` |
| Code | 0 or 1 only | `0` (collected) or `1` (failed) |
| Delay | 0-99 days | `00` |
| Reference | Alphanumeric + hyphen | `FMECHE251101705` |

### Parse Results

Each line produces a `ParsedCcpLine` object:

```typescript
{
  clientAccount: string;        // Original 10-digit account
  clientAccountHash: string;    // SHA-256 hash for security
  clientAccountMask: string;    // Display format: ****5172
  clientName: string;           // Original name
  clientNameNorm: string;       // Normalized for comparison
  amount: number;               // Parsed decimal
  operationDate: Date;          // Parsed date
  ccpAccount: string;           // CCP center account
  code: number;                 // 0 = success, 1 = failed
  delayDays: number;            // Number of days
  reference: string;            // Transaction reference
  cleanReference: string;       // Normalized reference
  isValid: boolean;             // Parse success
  errorReason?: string;         // Error description if invalid
}
```

### Invalid Line Handling

Lines are rejected if:
- Empty or whitespace only
- Don't match the format regex
- Contains invalid date (e.g., 02/30/2024)
- Amount is non-numeric
- Code is not 0 or 1
- Missing required fields

## Parsing Service Methods

### `parseLine(line: string, salt: string): ParsedCcpLine`

Parses a single line from a CCP RESULT file.

**Parameters**:
- `line`: Full line string from file
- `salt`: CLIENT_HASH_SALT for hashing

**Returns**: `ParsedCcpLine` object with validation result

**Example**:
```typescript
const result = parser.parseLine(
  '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705',
  'my-salt'
);

if (result.isValid) {
  console.log(result.amount);  // 786.67
  console.log(result.code);    // 0 (collected)
} else {
  console.error(result.errorReason);
}
```

### `parseFile(content: string, salt: string): ParsedCcpLine[]`

Parses complete file content.

**Parameters**:
- `content`: Full file text (usually from file.toString())
- `salt`: CLIENT_HASH_SALT for hashing

**Returns**: Array of `ParsedCcpLine` objects

**Example**:
```typescript
const fileContent = await fs.readFile('RESULT-file.txt', 'utf-8');
const lines = parser.parseFile(fileContent, salt);

const validLines = lines.filter(l => l.isValid);
const invalidLines = lines.filter(l => !l.isValid);
```

## Data Transformations

### Name Normalization

Names are normalized for comparison:
- Trimmed and lowercased
- Accents removed (àáâãäå → a)
- Special characters removed
- Multiple spaces collapsed

**Example**:
- Input: `"M.MENAOUER ALI"`
- Output: `"m.menaouer ali"`

### Reference Cleaning

References are cleaned for grouping:
- Uppercase
- Special characters removed (keeps alphanumeric + hyphen)
- Trimmed

**Example**:
- Input: `"FMECHE25-110/170#5"`
- Output: `"FMECHE251101705"`

### Account Masking

Accounts are masked for display:
- Shows only last 4 digits
- Other digits replaced with asterisks

**Example**:
- Input: `"0000565172"`
- Output: `"****5172"`

### Account Hashing

Accounts are hashed for security:
- SHA-256 algorithm
- Combined with CLIENT_HASH_SALT
- Used for client deduplication

## Performance Considerations

### Bulk Parsing

For 100+ files with 50,000+ lines:

```typescript
// This approach is efficient
const allLines: ParsedCcpLine[] = [];
for (const file of files) {
  const content = file.buffer.toString('utf-8');
  const lines = parser.parseFile(content, salt);
  allLines.push(...lines);
}
```

### Parallel Processing (Optional)

For very large batches, consider:

```typescript
const results = await Promise.all(
  files.map(file => 
    parser.parseFile(file.buffer.toString('utf-8'), salt)
  )
);
const allLines = results.flat();
```

### Memory Optimization

Avoid storing raw lines unless necessary:
```typescript
// Instead of storing rawLine, calculate stats directly
// This saves memory on large datasets
```

## Code Field Semantics

### Code = 0 (Collected / Successful)

- Payment was successfully collected
- Counted toward "montant encaissé"
- Included in collection rate numerator

### Code = 1 (Failed / Error)

- Payment collection failed
- Counted toward "montant échoué"
- Used for risk scoring
- Included in failure rate

### Business Logic

- Only code 0 and 1 are valid
- A single échéance can produce multiple lines (e.g., partial payments)
- Last line can be a small remainder (500 DA)
- **Risk is NOT determined by line count alone** but by failed amount and pattern

## Testing the Parser

### Test Sample Data

```typescript
const testLines = [
  '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705',
  '0001766185M.NAROUNE YOUCEF           00000000614.5805/01/20250021008367000AHMED241200104',
  '0002016874M.RADJA CHIKH              00000001640.0005/02/20250021008367000FMECHE250100301',
];

for (const line of testLines) {
  const result = parser.parseLine(line, salt);
  console.assert(result.isValid, `Should parse: ${line}`);
}
```

### Invalid Test Cases

```typescript
const invalidLines = [
  '',                              // Empty
  'INVALID FORMAT',                // Wrong format
  '00005651720000786.6705/03/2026', // Missing fields
  '0000565172NAME               0000000.99905/03/2026',  // Wrong date
];

for (const line of invalidLines) {
  const result = parser.parseLine(line, salt);
  console.assert(!result.isValid, `Should reject: ${line}`);
}
```

## Integration with Analysis Pipeline

1. **File Upload**: Files received as multipart
2. **Parsing**: Each file parsed completely
3. **Validation**: Invalid lines marked but not skipped
4. **Storage**: All lines stored in database
5. **Analysis**: Stats calculated across valid lines
6. **Reporting**: Reports include count of invalid lines

## Troubleshooting

### Issue: "Line does not match CCP RESULT format"

**Cause**: File is not in the expected format

**Solution**: Check that:
- File is from Algérie Poste CCP system
- File has .txt extension
- Lines follow the fixed-width format

### Issue: All lines invalid

**Cause**: Wrong file type or encoding

**Solution**:
- Verify file is RESULT output (not another CCP file type)
- Check file encoding (should be UTF-8 or Windows-1252)
- Validate a few lines manually against format specification

### Issue: Amounts parsed incorrectly

**Cause**: Decimal separator confusion

**Solution**:
- Parser expects `.` as decimal separator
- Files should have `XX.YY` format (e.g., `786.67`)
- Some systems use `,` instead (check input)

## References

See `backend/src/ccp/ccp-parser.service.ts` for implementation details.
