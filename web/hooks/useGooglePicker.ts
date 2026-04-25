'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const GOOGLE_API_SCRIPT_SRC = 'https://apis.google.com/js/api.js';

const PICKER_SUPPORTED_MIMES = [
  'application/pdf',
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.google-apps.spreadsheet',
].join(',');

const PICKER_SUPPORTED_MIMES_WITH_FOLDERS =
  PICKER_SUPPORTED_MIMES + ',application/vnd.google-apps.folder';

let pickerScriptPromise: Promise<void> | null = null;
let pickerLibraryPromise: Promise<void> | null = null;

declare global {
  interface Window {
    gapi?: {
      load: (module: string, callback: { callback: () => void } | (() => void)) => void;
    };
    google?: {
      picker?: any;
    };
  }
}

export interface GooglePickerSelectedFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  sizeBytes: number;
}

interface GoogleTokenResponse {
  success: boolean;
  accessToken?: string;
  expiresAtMs?: number;
  error?: string;
}

function ensureGoogleScriptLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.gapi) return Promise.resolve();
  if (pickerScriptPromise) return pickerScriptPromise;

  pickerScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_API_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.gapi) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Picker script.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_API_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Picker script.'));
    document.head.appendChild(script);
  });

  return pickerScriptPromise;
}

async function ensureGooglePickerLibraryLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.google?.picker) return;
  if (pickerLibraryPromise) return pickerLibraryPromise;

  await ensureGoogleScriptLoaded();
  pickerLibraryPromise = new Promise<void>((resolve, reject) => {
    const gapi = window.gapi;
    if (!gapi?.load) {
      reject(new Error('Google API client failed to initialize.'));
      return;
    }
    gapi.load('picker', {
      callback: () => resolve(),
    });
  });

  return pickerLibraryPromise;
}

function normalizeSelectedDocs(docs: any[] | undefined): GooglePickerSelectedFile[] {
  if (!Array.isArray(docs)) return [];
  return docs
    .map((doc) => {
      const id = typeof doc?.id === 'string' ? doc.id : '';
      const name = typeof doc?.name === 'string' ? doc.name : '';
      const mimeType = typeof doc?.mimeType === 'string' ? doc.mimeType : '';
      const modifiedTime = typeof doc?.lastEditedUtc === 'string' ? doc.lastEditedUtc : '';
      const sizeBytesRaw = doc?.sizeBytes;
      const sizeBytes =
        typeof sizeBytesRaw === 'number'
          ? sizeBytesRaw
          : typeof sizeBytesRaw === 'string'
            ? Number.parseInt(sizeBytesRaw, 10)
            : 0;
      if (!id || !name) return null;
      return {
        id,
        name,
        mimeType: mimeType || 'application/octet-stream',
        modifiedTime,
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
      };
    })
    .filter((item): item is GooglePickerSelectedFile => !!item);
}

export function useGooglePicker() {
  const [pickerReady, setPickerReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = useMemo(() => (process.env.NEXT_PUBLIC_GOOGLE_APP_ID || '').trim(), []);
  const clientId = useMemo(() => (process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '').trim(), []);

  useEffect(() => {
    let active = true;
    ensureGooglePickerLibraryLoaded()
      .then(() => {
        if (active) setPickerReady(true);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to initialize Google Picker.';
        setError(message);
      });
    return () => {
      active = false;
    };
  }, []);

  const pickFiles = useCallback(
    async (firebaseIdToken: string): Promise<GooglePickerSelectedFile[]> => {
      setLoading(true);
      setError(null);
      try {
        if (!clientId || !appId) {
          throw new Error('Google Picker is not configured. Missing client/app ID.');
        }

        await ensureGooglePickerLibraryLoaded();
        setPickerReady(true);

        const tokenRes = await fetch('/api/integrations/google/token', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${firebaseIdToken}`,
          },
          cache: 'no-store',
        });
        const tokenBody = (await tokenRes.json()) as GoogleTokenResponse;
        if (!tokenRes.ok || !tokenBody.success || !tokenBody.accessToken) {
          throw new Error(tokenBody.error || 'Google Drive is not connected. Connect it first.');
        }

        return await new Promise<GooglePickerSelectedFile[]>((resolve, reject) => {
          const pickerApi = window.google?.picker;
          if (!pickerApi) {
            reject(new Error('Google Picker API unavailable.'));
            return;
          }
          const scrollX = window.scrollX;
          const scrollY = window.scrollY;
          const pickerWidth = Math.max(820, Math.min(1120, window.innerWidth - 40));
          const pickerHeight = Math.max(560, Math.min(760, window.innerHeight - 40));
          let settled = false;
          let timeoutId: number | null = null;

          const restoreScroll = () => window.scrollTo(scrollX, scrollY);

          const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            if (timeoutId !== null) {
              window.clearTimeout(timeoutId);
            }
            restoreScroll();
            fn();
          };

          const docsView = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes(PICKER_SUPPORTED_MIMES_WITH_FOLDERS);

          const picker = new pickerApi.PickerBuilder()
            .setAppId(appId)
            .setOAuthToken(tokenBody.accessToken)
            .setOrigin(window.location.origin)
            .setSelectableMimeTypes(PICKER_SUPPORTED_MIMES_WITH_FOLDERS)
            .enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
            .setSize(pickerWidth, pickerHeight)
            .addView(docsView)
            .setCallback((data: any) => {
              const action = data?.action;
              if (action === pickerApi.Action.PICKED) {
                settle(() => resolve(normalizeSelectedDocs(data?.docs)));
                return;
              }
              if (action === pickerApi.Action.CANCEL) {
                settle(() => resolve([]));
              }
            })
            .build();

          picker.setVisible(true);
          // Keep the dashboard viewport stable without forcing body fixed-position.
          requestAnimationFrame(() => restoreScroll());
          window.setTimeout(() => restoreScroll(), 120);
          // Safety fallback: if picker callback never fires, don't leave scroll locked.
          timeoutId = window.setTimeout(
            () => settle(() => reject(new Error('Google Picker did not respond. Please try again.'))),
            90_000,
          );
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open Google Picker.';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [appId, clientId],
  );

  return {
    pickFiles,
    pickerReady,
    loading,
    error,
    clearError: () => setError(null),
  };
}
