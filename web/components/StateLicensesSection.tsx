'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';

/**
 * State Licenses settings section. Lives on `/dashboard/settings`
 * Profile tab. Wired in Chunk 4d.
 *
 * Agents licensed in multiple states upload one PDF + license number
 * + expiration per state. The booking-confirmation flow (Chunk 4e)
 * attaches the state-matched PDF to outbound MMS based on the
 * lead's `address.state`.
 *
 * The component is intentionally self-contained — settings/page.tsx is
 * already 1900+ lines, so we keep new feature surface in its own file.
 * Live state is read from `agentProfile.licenses` (passed in as a prop)
 * which the parent already subscribes to via Firestore onSnapshot.
 */

const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
  'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
  'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'PR',
] as const;

interface LicenseEntry {
  number: string;
  expiresOn: string | null;
  pdfStoragePath: string;
  uploadedAt: string;
}

interface Props {
  user: User | null;
  /** Live registry from agentProfile.licenses. Keyed by state code. */
  licenses: Record<string, LicenseEntry> | undefined;
  /**
   * Persist the next registry onto the parent's agent profile. Called
   * with the full updated map after an add or remove.
   *
   * We update optimistically from the authoritative server response
   * instead of re-reading the agent doc. The old re-read raced the
   * just-written license: the upload succeeded (no error, form closed)
   * but the immediate re-read didn't yet reflect the new entry, so the
   * row stayed invisible — and the dashboard's live snapshot listener
   * only patches `phonePaired`, so it never self-healed. Agents saw
   * "it didn't take" until a second save happened to read fresh.
   */
  onChange: (next: Record<string, LicenseEntry>) => void;
}

interface FormState {
  stateCode: string;
  number: string;
  expiresOn: string;
  file: File | null;
}

const EMPTY_FORM: FormState = { stateCode: '', number: '', expiresOn: '', file: null };

function isExpired(entry: LicenseEntry): boolean {
  if (!entry.expiresOn) return false;
  const today = new Date().toISOString().slice(0, 10);
  return entry.expiresOn < today;
}

export default function StateLicensesSection({ user, licenses, onChange }: Props) {
  const sortedStateCodes = useMemo(
    () => Object.keys(licenses || {}).sort(),
    [licenses],
  );
  const usedStates = useMemo(() => new Set(sortedStateCodes), [sortedStateCodes]);
  const availableStates = useMemo(
    () => US_STATE_CODES.filter((s) => !usedStates.has(s)),
    [usedStates],
  );

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteState, setPendingDeleteState] = useState<string | null>(null);
  const [openingPdfFor, setOpeningPdfFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Upload (POST /api/agent-licenses/upload) ──
  const handleUpload = useCallback(async () => {
    if (!user) return;
    if (!form.stateCode) return setError('Pick a state');
    if (!form.number.trim()) return setError('License number is required');
    if (!form.file) return setError('Upload your license file');
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append('file', form.file);
      fd.append('stateCode', form.stateCode);
      fd.append('number', form.number.trim());
      fd.append('expiresOn', form.expiresOn);
      const res = await fetch('/api/agent-licenses/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Upload failed (${res.status})`);
        return;
      }
      // Repaint optimistically from the server's authoritative entry so
      // the new row shows immediately — no re-read race (see Props.onChange).
      const savedStateCode =
        (typeof data?.stateCode === 'string' && data.stateCode) || form.stateCode;
      const savedEntry: LicenseEntry = (data?.entry as LicenseEntry) ?? {
        number: form.number.trim(),
        expiresOn: form.expiresOn || null,
        pdfStoragePath: '',
        uploadedAt: new Date().toISOString(),
      };
      onChange({ ...(licenses || {}), [savedStateCode]: savedEntry });
      resetForm();
      setShowAdd(false);
    } catch (err) {
      console.error('license upload error:', err);
      setError('Network error — please try again');
    } finally {
      setBusy(false);
    }
  }, [user, form, licenses, onChange, resetForm]);

  // ── Delete (DELETE /api/agent-licenses/[stateCode]) ──
  const handleDelete = useCallback(async (stateCode: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent-licenses/${stateCode}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || `Delete failed (${res.status})`);
        return;
      }
      const next = { ...(licenses || {}) };
      delete next[stateCode];
      onChange(next);
      setPendingDeleteState(null);
    } catch (err) {
      console.error('license delete error:', err);
      setError('Network error — please try again');
    } finally {
      setBusy(false);
    }
  }, [user, licenses, onChange]);

  // ── View PDF (GET /api/agent-licenses/[stateCode] → signed URL) ──
  const handleViewPdf = useCallback(async (stateCode: string) => {
    if (!user) return;
    setOpeningPdfFor(stateCode);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent-licenses/${stateCode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        setError(data?.error || 'Could not open license');
      }
    } finally {
      setOpeningPdfFor(null);
    }
  }, [user]);

  return (
    <div className="bg-white rounded-[5px] border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#005851] uppercase tracking-wide">State Licenses</h3>
          <p className="text-xs text-[#707070] mt-1">
            Upload one license per state you&apos;re licensed in. AFL attaches the
            state-matched license to your booking confirmation messages automatically
            based on the lead&apos;s state.
          </p>
        </div>
        {!showAdd && availableStates.length > 0 && (
          <button
            onClick={() => { setShowAdd(true); setError(null); }}
            className="px-3 py-1.5 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors whitespace-nowrap"
          >
            + Add state
          </button>
        )}
      </div>

      {/* Existing licenses */}
      {sortedStateCodes.length === 0 && !showAdd ? (
        <div className="text-sm text-[#707070] py-6 text-center bg-[#f8f8f8] rounded-[5px] border border-dashed border-gray-200">
          No state licenses yet. Add one to enable state-matched license attachments
          on booking confirmations.
        </div>
      ) : (
        <ul className="space-y-2">
          {sortedStateCodes.map((stateCode) => {
            const entry = licenses?.[stateCode];
            if (!entry) return null;
            const expired = isExpired(entry);
            const isPendingDelete = pendingDeleteState === stateCode;
            return (
              <li
                key={stateCode}
                className={`flex items-center gap-3 p-3 rounded-[5px] border ${
                  expired ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-[#fafafa]'
                }`}
              >
                <div className="font-mono text-sm font-bold text-[#005851] w-10 text-center">
                  {stateCode}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#000000] font-medium truncate">
                    Lic. #{entry.number}
                  </div>
                  <div className="text-xs text-[#707070] mt-0.5">
                    {entry.expiresOn ? (
                      <>
                        Expires {entry.expiresOn}
                        {expired && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 rounded">
                            Expired
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[#9CA3AF]">No expiration on file</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleViewPdf(stateCode)}
                  disabled={openingPdfFor === stateCode}
                  className="text-xs text-[#44bbaa] hover:text-[#005751] font-semibold disabled:opacity-50"
                >
                  {openingPdfFor === stateCode ? 'Opening…' : 'View'}
                </button>
                {isPendingDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => void handleDelete(stateCode)}
                      disabled={busy}
                      className="text-xs text-red-600 font-semibold hover:text-red-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <span className="text-[#d0d0d0]">|</span>
                    <button
                      onClick={() => setPendingDeleteState(null)}
                      disabled={busy}
                      className="text-xs text-[#9CA3AF] hover:text-[#707070] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setPendingDeleteState(stateCode)}
                    className="text-xs text-[#9CA3AF] hover:text-red-600 font-semibold"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add new license */}
      {showAdd && (
        <div className="mt-4 p-4 rounded-[5px] border border-[#45bcaa]/40 bg-[#daf3f0]/20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-[#000000] mb-1">State</label>
              <select
                value={form.stateCode}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                disabled={busy}
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa] bg-white"
              >
                <option value="">Pick a state</option>
                {availableStates.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#000000] mb-1">License number</label>
              <input
                type="text"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                disabled={busy}
                placeholder="e.g. 1234567"
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#000000] mb-1">
                Expiration <span className="text-[#9CA3AF] font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={form.expiresOn}
                onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
                disabled={busy}
                className="w-full px-3 py-2 rounded-[5px] border border-gray-200 text-sm focus:outline-none focus:border-[#45bcaa] focus:ring-1 focus:ring-[#45bcaa]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png"
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              disabled={busy}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="px-3 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors"
            >
              {form.file ? 'Change file' : 'Upload file'}
            </button>
            {form.file && (
              <span className="text-xs text-[#707070] truncate flex-1 min-w-0">
                {form.file.name} ({Math.round(form.file.size / 1024)} KB)
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#707070] mb-3">PDF, JPEG, or PNG · 10 MB max</p>

          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => { setShowAdd(false); resetForm(); }}
              disabled={busy}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-[#005851] border border-[#005851] rounded-[5px] hover:bg-[#f0faf8] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={busy}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-[#44bbaa] hover:bg-[#005751] rounded-[5px] transition-colors disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save license'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
