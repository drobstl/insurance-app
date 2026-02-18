import 'server-only';

import Twilio from 'twilio';

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
