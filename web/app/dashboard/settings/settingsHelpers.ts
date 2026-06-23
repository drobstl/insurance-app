import type { Area } from 'react-easy-crop';

/**
 * Shared types + pure helpers for the Settings tabs. Extracted from the
 * former single-file settings page so each tab component
 * (ProfileTab / BrandingTab / MessagesTab / AppointmentsLeadsTab /
 * AccountTab) can import what it needs. No behavior change — these are
 * the exact functions/types that previously lived at the top of
 * `page.tsx`.
 */

export type SaveMessage = { type: 'success' | 'error'; text: string } | null;

export interface GoogleDriveStatusResponse {
  success: boolean;
  connected: boolean;
  data?: {
    googleEmail?: string;
    connectedAt?: string;
    updatedAt?: string;
    scope?: string;
    hasRefreshToken: boolean;
  };
  error?: string;
}

export interface GoogleCalendarStatusResponse {
  success: boolean;
  connected: boolean;
  data?: {
    googleEmail?: string;
    connectedAt?: string;
    updatedAt?: string;
    scope?: string;
    hasRefreshToken: boolean;
  };
  error?: string;
}

export interface LeadVideoItem {
  id: string;
  title: string;
  url: string;             // HLS playlist — what the mobile player plays.
  iframeUrl?: string;      // Bunny hosted-player URL — used for in-browser preview.
  thumbnailUrl?: string;
  videoId?: string;        // Bunny GUID — needed when deleting.
  updatedAt?: string;
}

// Sanity cap on lead-home video uploads. Bunny.net Stream accepts much
// bigger files, but anything above this for an intro / FAQ / case-study
// video is almost certainly the wrong file picked by accident (a
// vacation movie, a screen recording). Catch it in the browser before
// the agent burns half an hour uploading it; the server endpoint
// re-checks the size the browser advertised as defense in depth.
export const MAX_LEAD_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB

export function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function getCroppedImage(imageSrc: string, pixelCrop: Area, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = Math.min(pixelCrop.width, pixelCrop.height);
      const outSize = Math.min(size, maxSize);
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, outSize, outSize,
      );
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
}

export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function detectSchedulingPlatform(url: string): string | null {
  if (/calendly\.com/i.test(url)) return 'Calendly';
  if (/cal\.com/i.test(url)) return 'Cal.com';
  if (/acuityscheduling\.com/i.test(url)) return 'Acuity';
  if (/calendar\.google\.com/i.test(url)) return 'Google Calendar';
  return null;
}
