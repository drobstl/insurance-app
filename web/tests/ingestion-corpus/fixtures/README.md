# Ingestion Corpus Fixtures

This folder holds the fixed corpus used to gate ingestion deploys.

## Required fixture set

The corpus runner expects these five fixtures (exact IDs are defined in `../expectations.json`):

- `tiny_application.pdf`
- `large_application.pdf`
- `multi_page_application.pdf`
- `scanned_application.pdf`
- `malformed_application.pdf`

## What each file should represent

- `tiny`: small, clean PDF with straightforward fields.
- `large`: larger PDF (many pages/attachments) to catch timeout/perf regressions.
- `multi_page`: policy data split across multiple pages/sections.
- `scanned_image`: image-heavy/scanned PDF where OCR/model extraction is stressed.
- `malformed`: corrupted or structurally invalid PDF that should fail with a typed error.

## Governance

- Keep these files stable over time; replace only when intentionally updating the benchmark set.
- When you replace a fixture, update `../expectations.json` metadata and rerun the corpus script.
- Do not include real customer PII. Use synthetic/redacted documents only.
