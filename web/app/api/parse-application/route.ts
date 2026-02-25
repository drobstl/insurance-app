import { NextRequest, NextResponse } from 'next/server';
import { pdfToBase64 } from '../../../lib/pdf-parser';
import { extractApplicationFields } from '../../../lib/application-extractor';
import type { ParseApplicationResponse } from '../../../lib/types';

/** Allow up to 60 seconds for PDF parsing + AI extraction (Vercel Pro). */
export const maxDuration = 60;

/** Maximum file size: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse<ParseApplicationResponse>> {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No PDF file provided.' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { success: false, error: 'Please upload a PDF file.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File is too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = pdfToBase64(buffer);

    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0b100'},body:JSON.stringify({sessionId:'a0b100',location:'route.ts:pdf-encoded',message:'PDF base64 encoded',data:{pdfSizeBytes:buffer.length,base64Length:pdfBase64.length},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Send the full PDF directly to Claude for vision-based extraction
    let extraction;
    try {
      extraction = await extractApplicationFields(pdfBase64);
      // #region agent log
      fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0b100'},body:JSON.stringify({sessionId:'a0b100',location:'route.ts:extraction-success',message:'Claude extraction succeeded',data:{hasData:!!extraction.data,note:extraction.note,insuredName:extraction.data?.insuredName,beneficiaries:extraction.data?.beneficiaries},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (aiError) {
      // #region agent log
      fetch('http://127.0.0.1:7529/ingest/3df258c5-0e25-4ab3-9d32-fc3332e1a7f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0b100'},body:JSON.stringify({sessionId:'a0b100',location:'route.ts:extraction-error',message:'Claude extraction failed',data:{error:aiError instanceof Error ? aiError.message : String(aiError)},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const message = aiError instanceof Error ? aiError.message : 'AI extraction failed.';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: extraction.data,
      note: extraction.note,
    });
  } catch (error) {
    console.error('Parse application error:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
