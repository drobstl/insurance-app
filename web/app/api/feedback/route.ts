import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      agentName,
      agentEmail,
      feedbackType,
      question,
      response,
      rating,
      issueType,
      screenshotUrl,
    } = body;

    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!serviceAccountEmail || !privateKey || !sheetId) {
      return NextResponse.json(
        { error: 'Google Sheets credentials are not configured.' },
        { status: 500 },
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: serviceAccountEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            new Date().toISOString(), // Timestamp
            agentName ?? '',          // Agent Name
            agentEmail ?? '',         // Agent Email
            feedbackType ?? '',       // Feedback Type
            question ?? '',           // Question
            response ?? '',           // Response
            rating ?? '',             // Rating
            issueType ?? '',          // Issue Type
            screenshotUrl ?? '',      // Screenshot URL
          ],
        ],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Feedback API error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to submit feedback';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
