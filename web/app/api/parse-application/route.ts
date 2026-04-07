import { NextRequest, NextResponse } from 'next/server';
import { extractApplicationFields } from '../../../lib/application-extractor';
import type { ParseApplicationResponse } from '../../../lib/types';

const MAX_APPLICATION_PDF_BYTES = 13 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse<ParseApplicationResponse>> {
  const startedAt = Date.now();
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Missing PDF file.' },
        { status: 400 },
      );
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return NextResponse.json(
        { success: false, error: 'Please upload a PDF file.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_APPLICATION_PDF_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File is too large. Maximum size is 13MB.' },
        { status: 400 },
      );
    }

    const sourceStart = Date.now();
    const bytes = Buffer.from(await file.arrayBuffer());
    const sourceMs = Date.now() - sourceStart;
    const pdfBase64 = bytes.toString('base64');

    // #region agent log
    fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix',hypothesisId:'H14',location:'parse-application/route.ts:POST:entry',message:'direct_parse_fallback_started',data:{fileName:file.name,fileSize:file.size,fileType:file.type||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const extractStart = Date.now();
    const extracted = await extractApplicationFields(pdfBase64, { fileSizeBytes: file.size });
    const extractMs = Date.now() - extractStart;

    // #region agent log
    fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix',hypothesisId:'H14',location:'parse-application/route.ts:POST:success',message:'direct_parse_fallback_succeeded',data:{fileName:file.name,hasData:Boolean(extracted.data)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      success: true,
      data: extracted.data,
      note: extracted.note || undefined,
      pageCount: 0,
      timings: {
        totalMs: Date.now() - startedAt,
        sourceMs,
        extractMs,
        parserPath: 'ai-pdf',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse application PDF.';
    // #region agent log
    fetch('http://127.0.0.1:7412/ingest/09931433-2034-41d9-90f4-26d8a7253b3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'abd57d'},body:JSON.stringify({sessionId:'abd57d',runId:'pre-fix',hypothesisId:'H14',location:'parse-application/route.ts:POST:catch',message:'direct_parse_fallback_failed',data:{errorType:error instanceof Error?error.name:typeof error,errorMessage:message},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
