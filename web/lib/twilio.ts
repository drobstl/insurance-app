import 'server-only';

import Twilio from 'twilio';
import { NextRequest } from 'next/server';

let client: Twilio.Twilio | null = null;

export function getTwilioClient(): Twilio.Twilio {
  if (client) return client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials are not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).');
  }

  client = Twilio(accountSid, authToken);
  return client;
}

export function getTwilioPhoneNumber(): string {
  const number = process.env.TWILIO_PHONE_NUMBER;
  if (!number) {
    throw new Error('TWILIO_PHONE_NUMBER is not configured.');
  }
  return number;
}

/**
 * Validate that an incoming request was signed by Twilio.
 * Returns true if the X-Twilio-Signature header matches, false otherwise.
 * Requires TWILIO_AUTH_TOKEN to be set.
 */
export async function validateTwilioRequest(req: NextRequest): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const signature = req.headers.get('x-twilio-signature');
  if (!signature) return false;

  const url = req.url;

  const cloned = req.clone();
  const formData = await cloned.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  return Twilio.validateRequest(authToken, signature, url, params);
}
