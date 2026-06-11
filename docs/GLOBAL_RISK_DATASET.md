# Global Risk Dataset

CCP Analyzer DZ stores a separate anonymized national risk dataset in PostgreSQL through the `GlobalRiskClient` model. This dataset is separate from VYVEX ERP and is not exposed through public MVP endpoints.

## Purpose

The dataset aggregates CCP payment behavior across uploaded sessions so Algerian showrooms can eventually benefit from broader risk indicators without sharing raw CCP account numbers or original uploaded files between showrooms.

## Stored Identity

- `clientAccountHash`: SHA-256 hash of the CCP account using `CLIENT_HASH_SALT`.
- `clientNameHash`: optional SHA-256 hash of the normalized client name.
- Raw CCP account numbers are not stored in this model.
- Public result and CSV endpoints show only masked CCP accounts such as `******5172`.

## Aggregated Metrics

For each hashed client account, the app stores:

- first and last seen date
- number of upload sessions where the client appeared
- wilayas where the client was observed
- total attempted, collected, and failed amounts
- success and failed line counts
- unique failed reference count
- failed month count
- last failure date
- risk score and French risk level

## Risk Dataset Updates

Every successful `/api/ccp/upload` updates `GlobalRiskClient` after the session KPIs are calculated.

The update is based on structured parsed lines only:

- `code = 0` increases collected amount and success count.
- `code = 1` increases failed amount, failed count, failed references, and failed months.
- Raw failed line count alone does not classify a client as risky or blocked.

## Privacy Boundary

The MVP does not publish global risk data. Future admin or market statistics endpoints must be protected before deployment and must avoid exposing raw account numbers, raw uploaded files, or personally identifying data beyond what the operator is allowed to process.

## Operational Notes

- Use a long random `CLIENT_HASH_SALT` and keep it stable; changing it creates a new hash universe.
- Rotate application secrets carefully. Rotating `ACCESS_TOKEN_SECRET` invalidates existing report tokens.
- Back up the PostgreSQL database regularly because the risk dataset is cumulative.
