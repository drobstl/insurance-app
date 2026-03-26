import 'server-only';

import * as XLSX from 'xlsx';
import { extractBobFromText } from './bob-extractor';
import { parseBobDeterministically } from './bob-deterministic-parser';
import { IngestionV3Error } from './ingestion-v3-errors';
import { validateAndNormalizeV3BobResult } from './ingestion-v3-validate';
import type { IngestionV3BobResult } from './ingestion-v3-types';

export async function extractBobStructuredV3(input: {
  fileBuffer: Buffer;
  fileName?: string;
  contentType?: string;
}): Promise<{ result: IngestionV3BobResult; parserPath: 'deterministic' | 'ai-text' | 'csv-parser' }> {
  const fileName = (input.fileName || '').toLowerCase();
  const contentType = (input.contentType || '').toLowerCase();
  const textSource = toTextSource(input.fileBuffer, fileName, contentType);

  const deterministic = parseBobDeterministically(textSource, input.fileName || 'upload.csv');
  if (deterministic.rows.length > 0 && deterministic.confidence === 'high') {
    return {
      result: validateAndNormalizeV3BobResult({
        rows: deterministic.rows.map(mapBobRow),
        rowCount: deterministic.rows.length,
        note: deterministic.note,
      }),
      parserPath: 'deterministic',
    };
  }

  const aiExtraction = await extractBobFromText(textSource);
  return {
    result: validateAndNormalizeV3BobResult({
      rows: aiExtraction.rows.map(mapBobRow),
      rowCount: aiExtraction.rowCount,
      note: aiExtraction.note,
    }),
    parserPath: contentType.includes('sheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'csv-parser' : 'ai-text',
  };
}

function toTextSource(buffer: Buffer, fileName: string, contentType: string): string {
  const isSpreadsheet =
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    contentType.includes('spreadsheetml') ||
    contentType.includes('application/vnd.ms-excel');

  if (isSpreadsheet) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new IngestionV3Error('SOURCE_UNSUPPORTED_TYPE', 'Spreadsheet does not contain any sheets.', {
        retryable: false,
        terminal: true,
      });
    }
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
    if (!csv.trim()) {
      throw new IngestionV3Error('SOURCE_FETCH_FAILED', 'Spreadsheet is empty.', {
        retryable: false,
        terminal: true,
      });
    }
    return csv;
  }

  const text = new TextDecoder().decode(buffer);
  if (!text.trim()) {
    throw new IngestionV3Error('SOURCE_FETCH_FAILED', 'Source file is empty.', {
      retryable: false,
      terminal: true,
    });
  }
  return text;
}

function mapBobRow(row: {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  policyType: string;
  policyNumber: string;
  carrier: string;
  premium: string;
  coverageAmount: string;
}) {
  const [firstName, ...rest] = (row.name || '').trim().split(/\s+/);
  const lastName = rest.join(' ').trim();
  return {
    firstName: firstName || row.name || '',
    lastName,
    phone: toNullableString(row.phone),
    email: toNullableString(row.email),
    dateOfBirth: toNullableString(row.dateOfBirth),
    policyType: toNullableString(row.policyType),
    policyNumber: toNullableString(row.policyNumber),
    carrier: toNullableString(row.carrier),
    premiumAmount: toNullableNumber(row.premium),
    coverageAmount: toNullableNumber(row.coverageAmount),
  };
}

function toNullableString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,$]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
