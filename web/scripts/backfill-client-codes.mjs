/**
 * One-time script to backfill the clientCodes index collection.
 * Run from the web/ directory: node scripts/backfill-client-codes.mjs
 */
import { readFileSync } from 'fs';
import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Load service account from environment or .env.local
const envFile = readFileSync('.env.local', 'utf8');
const b64Match = envFile.match(/FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64=(.+)/);
const rawMatch = envFile.match(/FIREBASE_ADMIN_SERVICE_ACCOUNT=(.+)/);

let serviceAccount;
if (b64Match) {
  serviceAccount = JSON.parse(Buffer.from(b64Match[1].trim(), 'base64').toString('utf8'));
} else if (rawMatch) {
  serviceAccount = JSON.parse(rawMatch[1].trim());
} else {
  console.error('No Firebase Admin credentials found in .env.local');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function run() {
  const agentsSnap = await db.collection('agents').get();
  let indexed = 0, skipped = 0;

  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await db.collection('agents').doc(agentDoc.id).collection('clients').get();
    for (const clientDoc of clientsSnap.docs) {
      const code = clientDoc.data().clientCode;
      if (!code || typeof code !== 'string') { skipped++; continue; }
      await db.collection('clientCodes').doc(code.trim().toUpperCase()).set({
        agentId: agentDoc.id,
        clientId: clientDoc.id,
      });
      indexed++;
      process.stdout.write(`\r  Indexed ${indexed} codes...`);
    }
  }

  console.log(`\nDone! Indexed: ${indexed}, Skipped: ${skipped}`);
}

run().catch(console.error);
