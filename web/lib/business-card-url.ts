import 'server-only';

import { getAdminFirestore, getAdminStorage } from './firebase-admin';
import { uploadAttachment } from './linq';

/**
 * Ensures the agent's business card is uploaded to Firebase Storage
 * and returns a public URL suitable for media attachments.
 *
 * On first call, uploads the base64 image and caches the URL on the
 * agent document as `businessCardUrl`. Subsequent calls return the
 * cached URL immediately.
 *
 * Returns null if the agent has no business card.
 */
export async function getBusinessCardUrl(agentId: string): Promise<string | null> {
  const db = getAdminFirestore();
  const agentRef = db.collection('agents').doc(agentId);
  const agentSnap = await agentRef.get();

  if (!agentSnap.exists) return null;

  const data = agentSnap.data()!;

  if (data.businessCardUrl) {
    return data.businessCardUrl as string;
  }

  const base64 = data.businessCardBase64 as string | undefined;
  if (!base64) return null;

  try {
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const filePath = `business-cards/${agentId}.jpg`;
    const file = bucket.file(filePath);

    const buffer = Buffer.from(base64, 'base64');

    await file.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
      },
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    await agentRef.update({ businessCardUrl: publicUrl });

    return publicUrl;
  } catch (error) {
    console.error('Failed to upload business card to Storage:', error);
    return null;
  }
}

/**
 * Ensures the agent's business card is pre-uploaded to Linq as a
 * reusable attachment and returns the permanent attachment_id.
 *
 * Caches the ID on the agent doc as `linqBusinessCardAttachmentId`.
 * Returns null if the agent has no business card image.
 */
export async function getLinqAttachmentId(agentId: string): Promise<string | null> {
  const db = getAdminFirestore();
  const agentRef = db.collection('agents').doc(agentId);
  const agentSnap = await agentRef.get();

  if (!agentSnap.exists) return null;

  const data = agentSnap.data()!;

  if (data.linqBusinessCardAttachmentId) {
    return data.linqBusinessCardAttachmentId as string;
  }

  const base64 = data.businessCardBase64 as string | undefined;
  if (!base64) return null;

  try {
    const buffer = Buffer.from(base64, 'base64');

    const attachmentId = await uploadAttachment({
      filename: `${agentId}_business_card.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: buffer.length,
      fileBuffer: buffer,
    });

    await agentRef.update({ linqBusinessCardAttachmentId: attachmentId });

    return attachmentId;
  } catch (error) {
    console.error('Failed to upload business card to Linq:', error);
    return null;
  }
}
